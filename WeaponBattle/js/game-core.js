/**
 * ゲーム全体のメインシステムを管理するコアクラス
 * 3D空間のセットアップ、プレイヤーや敵の更新、当たり判定、ループ処理などを一括で行います
 */
class GameCore
{
    constructor()
    {
        // HTML上の描画用キャンバスを取得
        this.canvas = document.getElementById('game-canvas');

        // ゲームの状態管理用フラグ
        this.isPaused = false;   // 一時停止中か
        this.isPlaying = false;  // ゲームプレイ中か

        // 各種ゲームオブジェクトを管理する配列
        this.enemies = [];    // 出現中の敵（Enemyインスタンス）のリスト
        this.particles = [];  // 画面上のエフェクト粒子のリスト
        this.bullets = [];    // 画面上の弾丸（Bulletインスタンス）のリスト
        this.visualEffects = []; // 3Dメッシュによるスキル等のビジュアルエフェクトリスト

        // ゲームクリア用の特殊ビジュアルエフェクト用配列
        this.confettiList = []; // 舞い落ちる紙吹雪メッシュのリスト
        this.celebrationIntervals = []; // 祝砲花火タイマーの管理リスト


        // 画面揺れ（スクリーンシェイク）の残り時間（フレーム数）
        this.shakeTime = 0;

        // Wave管理用の変数
        this.currentWave = 1;         // 現在のWave数
        this.maxWave = 3;             // 最大Wave数（3でボス戦）
        this.waveState = 'spawning';  // 'spawning'(出現中), 'playing'(戦闘中), 'interval'(休憩中), 'cleared'(全面クリア)
        this.waveTimer = 0;           // インターバル用のタイマー（フレーム数または秒数換算用）
        this.waveEnemyCount = 0;      // このWaveで出現させる総敵数
        this.spawnedCount = 0;        // 既にスポーンした敵の数

        // Three.js の初期化処理を実行
        this.initThree();

        // ブラウザの画面サイズが変更されたら自動で描画サイズを調整するイベント
        window.addEventListener('resize', () => this.onResize());

        // gameCore の constructor または初期設定内に追記
        this.mouse = new THREE.Vector2(); // マウスの画面上の2D位置
        this.mouseWorldPosition = new THREE.Vector3(); // 変換後の3D空間の床の座標
        this.raycaster = new THREE.Raycaster(); // マウスの奥を検知する光線銃

        // マウスが動いたときに2D座標を常に更新するイベント
        window.addEventListener('mousemove', (e) =>
        {
            // 画面全体の中心を (0,0) とした -1.0 〜 1.0 の座標に変換
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });
    }

    /**
     * Three.jsの基本コンポーネント（シーン、カメラ、レンダラー、ライト、地面）を構築
     */
    initThree()
    {
        // 1. 3D空間（シーン）を作成し、背景色を深い紺色に設定
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111118);

        // 2. camera（視野角60度、アスペクト比、クリッピング手前・奥）を作成し、斜め上空に配置
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 15, 12);
        this.camera.lookAt(0, 0, 0); // 原点（中心）を向く

        // 3. レンダラー（描画処理マシン）を作成し、キャンバスのサイズを画面いっぱいに広げる
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true; // 影の表現を有効化

        // 4. 照明（ライト）の追加
        // 環境光（全体を均等に薄暗く照らす光）
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        // 平行光源（太陽光のように特定の方角から差し込む強い光）
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        this.scene.add(dirLight);

        // 照準用の細いリング（半径0.6、チューブの太さ0.05）を生成
        const reticleGeo = new THREE.TorusGeometry(0.6, 0.05, 8, 32);
        // 魔法らしく、少し発光するマテリアル（色は薄い紫など）
        this.reticleMat = new THREE.MeshBasicMaterial({
            color: 0xaa00ff,
            transparent: true,
            opacity: 0.6
        });
        this.reticle = new THREE.Mesh(reticleGeo, this.reticleMat);

        // リングが地面と水平（床に張り付く形）になるように90度回転
        this.reticle.rotation.x = Math.PI / 2;
        this.reticle.visible = false; // 最初は非表示
        this.scene.add(this.reticle);
    }

    /**
     * ゲームを新しく開始するメソッド
     * @param {string} weaponType - 選択された武器の種類 ('sword', 'axe', 'magic')
     */
    start(weaponType)
    {
        // 前回の残骸を綺麗にクリーンアップ
        this.clearScene();

        // ゲーム中フラグをONにする
        this.isPlaying = true;
        this.isPaused = false;

        // Wave状態のリセット
        this.currentWave = 1;
        this.waveState = 'spawning';
        this.spawnedCount = 0;

        // Wave 1 の敵の数を設定（例: 雑魚8体）※進行テスト用に少し減らしてもOKです
        this.waveEnemyCount = 8;

        // ✨【UI連携】画面上部のWaveカウンターHUDを表示状態にする
        const waveHud = document.getElementById('wave-hud');
        if (waveHud)
        {
            waveHud.classList.add('active');
        }

        // 新しいステージと障害物の生成
        this.stage = new Stage(this.scene);

        // プレイヤーを生成
        this.player = new Player(this.scene, weaponType);

        if (weaponType === 'magic')
        {
            this.reticle.visible = true;
            this.reticleMat.color.setHex(0xaa00ff); // 魔法通常弾の紫
        }
        else
        {
            this.reticle.visible = false; // 剣や斧の時は隠す
        }

        // プレイヤーからこのGameCore内の「spawnBullet」などを呼べるように、自分自身の参照を渡す
        this.player.gameCore = this;

        // 開幕時に最初の数体を即座に出現させるロジックへ移行
        this.startNextWave();
    }

    /**
     * 敵をランダムな位置に新しく出現させる
     * @param {boolean} isBoss - ボスを生成するかどうか
     */
    spawnEnemy(isBoss = false)
    {
        // ボスではない場合のみ、同時存在上限（10体）をチェックする
        if (!isBoss && this.enemies.length >= 10)
        {
            return;
        }

        let type = 'melee';
        if (isBoss)
        {
            type = 'boss'; // Enemyクラス側でボスとして識別させるためのタイプ名
        }
        else
        {
            // 通常時は近接型（melee）か遠隔型（range）かをランダムで決定
            const types = ['melee', 'range'];
            type = types[Math.floor(Math.random() * types.length)];
        }

        // プレイヤーの現在位置を中心とした、半径10〜15マスのランダムな円周上の座標を計算
        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.random() * 5;
        const px = this.player.mesh.position.x + Math.cos(angle) * radius;
        const pz = this.player.mesh.position.z + Math.sin(angle) * radius;

        // 1. 計算した座標に敵（Enemy）のインスタンスを作成
        const enemy = new Enemy(this.scene, this.player, type, new THREE.Vector3(px, 0, pz));

        // 2. 敵が遠隔攻撃の弾を撃てるように、GameCoreへの参照を教えてあげる
        enemy.gameCore = this;

        // 3. 管理用の配列に登録する
        this.enemies.push(enemy);

        this.spawnedCount++;
    }

    /**
     * 外部（PlayerやEnemy）から呼び出されて、新しい弾丸を画面内に生成する窓口関数
     */
    spawnBullet(position, direction, speed, damage, isPlayerBullet, color, size, isSkill)
    {
        // 拡張した引数をそのまま Bullet のコンストラクタに横流しする
        const bullet = new Bullet(this.scene, position, direction, speed, damage, isPlayerBullet, color, size, isSkill);
        this.bullets.push(bullet);

        // 生成したインスタンスを呼び出し元に返すようにする（念のため）
        return bullet;
    }

    /**
     * 指定された位置に、飛び散る光の粒子（エフェクト）を生成する
     */
    createParticleEffect(position, color, count)
    {
        for (let i = 0; i < count; i++)
        {
            // 極小の球体を生成
            const pGeom = new THREE.SphereGeometry(0.1, 4, 4);
            const pMat = new THREE.MeshBasicMaterial({ color: color });
            const pMesh = new THREE.Mesh(pGeom, pMat);
            pMesh.position.copy(position);

            // 四方八方、および上方向へランダムに飛び散る「初速度ベクトル」を計算
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                Math.random() * 0.3, // Y軸（上方向）には必ずプラスの力が働くようにする
                (Math.random() - 0.5) * 0.3
            );

            this.scene.add(pMesh);
            // 配列にメッシュ、速度、速度、そして寿命（30フレーム＝約0.5秒）を記録
            this.particles.push({ mesh: pMesh, vel: velocity, life: 30 });
        }
    }

    /**
     * 剣・斧のスキル用の派手な3Dビジュアルエフェクトを生成するメソッド
     * @param {string} type - エフェクトの種類 ('sword-skill' または 'axe-skill')
     * @param {THREE.Vector3} position - 発生させる中心座標
     * @param {number} radius - 最大サイズ（判定に合わせる）
     */
    spawnVisualEffect(type, position, radius)
    {
        let geom, mat, mesh;

        if (type === 'sword-skill')
        {
            // ⚔️ 剣のスキル：水平に広がる太い「光の輪（リング）」
            geom = new THREE.TorusGeometry(0.1, 0.2, 8, 32);
            mat = new THREE.MeshBasicMaterial({
                color: 0x33ccff,      // 鮮やかな水色
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            mesh = new THREE.Mesh(geom, mat);
            mesh.rotation.x = Math.PI / 2; // 床と水平にする
            mesh.position.copy(position);
            mesh.position.y = 0.5; // プレイヤーの胴体の高さに浮かせる
        }
        else if (type === 'axe-skill')
        {
            // 🪓 斧のスキル：地面を這う「衝撃波の円盤」
            geom = new THREE.RingGeometry(0.01, 0.2, 32);
            mat = new THREE.MeshBasicMaterial({
                color: 'orange',      // 衝撃波らしいオレンジ色
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide
            });
            mesh = new THREE.Mesh(geom, mat);
            mesh.rotation.x = -Math.PI / 2; // 地面にぴったり張り付かせる
            mesh.position.copy(position);
            mesh.position.y = 0.05; // 床のチラつき防止にほんの少しだけ浮かせる
        }

        if (mesh)
        {
            this.scene.add(mesh);
            // 配列に格納（寿命は15フレーム：約0.25秒でシュッと広がって消える設定）
            this.visualEffects.push({
                type: type,
                mesh: mesh,
                maxRadius: radius,
                currentProgress: 0, // 0.0 〜 1.0
                life: 15,
                maxLife: 15
            });
        }
    }

    /**
     * 画面揺れ（スクリーンシェイク）のトリガーを引く
     */
    triggerScreenShake()
    {
        this.shakeTime = 20; // 今から20フレームの間、カメラをガタガタ揺らす
    }

    /**
     * メインのゲームループ処理（1秒間に約60回実行され、画面を動かします）
     */
    update()
    {
        // ゲームが始まっていない、または一時停止中の場合は何も処理しない
        if (!this.isPlaying || this.isPaused)
        {
            return;
        }

        // Waveの進行状態を毎フレームチェックする
        this.checkWaveProgress();

        // gameCore の 毎フレーム呼ばれる update() メソッドの冒頭に追記
        if (this.camera && this.player)
        {
            // カメラからマウスカーソルの方向に向けて見えない光線（Ray）を飛ばす
            this.raycaster.setFromCamera(this.mouse, this.camera);

            // 地面（高さ Y=0 の水平な板）を数式で定義
            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

            // 光線がその地面の板と交わる「3Dの座標」を計算して this.mouseWorldPosition に格納
            this.raycaster.ray.intersectPlane(groundPlane, this.mouseWorldPosition);

            if (this.reticle && this.reticle.visible)
            {
                // マウスが指す床の座標に照準リングを移動
                this.reticle.position.copy(this.mouseWorldPosition);
                // 床（Y=0）と完全に重なってチラつかないよう、ごくわずかに上に浮かせる
                this.reticle.position.y = 0.02;
            }
        }

        // --- 1. プレイヤーの更新 ---
        this.player.update(
            this.enemies,
            () => this.triggerScreenShake(),
            (pos, col, cnt) => this.createParticleEffect(pos, col, cnt)
        );

        // プレイヤーの移動直後にステージ・障害物との衝突判定（押し戻し）を適用
        if (this.stage)
        {
            this.stage.checkCollision(this.player.mesh, 0.5); // 0.5はプレイヤーの半径
        }

        // プレイヤーが死亡した場合は即座にループを抜け、ゲーム終了（敗北）へ移行
        if (this.player.isDead)
        {
            this.gameOver(false); // ❌ プレイヤー死亡によるゲームオーバー
            return;
        }

        // --- 2. カメラ追従 ＆ 画面揺れ演出 ---
        let camX = this.player.mesh.position.x;
        let camZ = this.player.mesh.position.z + 12; // プレイヤーの少し手前上空をキープ

        // 画面揺れタイマーが残っている場合、座標をランダムに小刻みにズラす
        if (this.shakeTime > 0)
        {
            camX += (Math.random() - 0.5) * 0.3;
            camZ += (Math.random() - 0.5) * 0.3;
            this.shakeTime--; // タイマーを消費
        }
        this.camera.position.set(camX, 15, camZ);
        this.camera.lookAt(this.player.mesh.position); // 常にプレイヤーを画面中央に捉える

        // --- 3Dビジュアルエフェクトの更新 ＆ 寿命制御 ---
        for (let i = this.visualEffects.length - 1; i >= 0; i--)
        {
            const fx = this.visualEffects[i];
            fx.life--;

            // 進捗度を 0.0 (発生) から 1.0 (消滅) で計算
            fx.currentProgress = 1.0 - (fx.life / fx.maxLife);

            // 1. サイズの動的変更（進捗に合わせて最大半径まで一気に広げる）
            const scale = fx.currentProgress * fx.maxRadius * 5; // 元のジオメトリサイズに合わせる倍率調整
            fx.mesh.scale.set(scale, scale, scale);

            // 2. 特有の動き（剣なら高速大回転させる）
            if (fx.type === 'sword-skill')
            {
                fx.mesh.rotation.z += 0.4; // Z軸方向（水平に寝かせたリングの回転面）へ回転
            }

            // 3. 透明度のフェードアウト（消滅間際にスッと薄くする）
            fx.mesh.material.opacity = (1.0 - fx.currentProgress) * 0.8;

            // 寿命が尽きたエフェクトは空間と配列からきれいに消去
            if (fx.life <= 0)
            {
                this.scene.remove(fx.mesh);
                fx.mesh.geometry.dispose();
                fx.mesh.material.dispose();
                this.visualEffects.splice(i, 1);
            }
        }

        // --- 3. 弾丸の更新と衝突（ヒット）判定 ---
        for (let i = this.bullets.length - 1; i >= 0; i--)
        {
            const bullet = this.bullets[i];
            bullet.update(); // 弾を前進させる

            // 寿命が尽きて死んだ弾は配列から除去して次の弾の処理へ
            if (bullet.isDead)
            {
                this.bullets.splice(i, 1);
                continue;
            }

            // 弾丸とステージの障害物・外周との衝突判定
            let bulletHitObstacle = false;
            if (this.stage)
            {
                const bPos = bullet.mesh.position;

                // ① ステージの外に出たら消滅
                const distFromCenter = Math.sqrt(bPos.x * bPos.x + bPos.z * bPos.z);
                if (distFromCenter > this.stage.radius)
                {
                    bulletHitObstacle = true;
                }

                // ② 内側の障害物のどれかに当たったら消滅
                this.stage.obstacles.forEach(obs =>
                {
                    const dx = bPos.x - obs.position.x;
                    const dz = bPos.z - obs.position.z;
                    const distToObs = Math.sqrt(dx * dx + dz * dz);

                    // 弾自体のサイズを考慮（だいたい0.2〜0.5マス程度）
                    if (distToObs < obs.radius + 0.2)
                    {
                        bulletHitObstacle = true;
                    }
                });
            }

            // 障害物に衝突していた場合のクリーンアップ処理
            if (bulletHitObstacle)
            {
                // 障害物に当たったエフェクト（薄いグレーか、弾の色に合わせた火花）を散らす
                this.createParticleEffect(bullet.mesh.position, 0xaaaaaa, 6);
                bullet.destroy();
                this.bullets.splice(i, 1);
                continue; // この弾の処理はここまで。次の弾へ
            }

            // A. プレイヤーが撃った弾の場合 → 敵との当たり判定
            if (bullet.isPlayerBullet)
            {
                for (let j = this.enemies.length - 1; j >= 0; j--)
                {
                    const enemy = this.enemies[j];

                    // 高さ(Y)を無視した2D平面上での弾と敵の距離を計算（当たりやすさ向上のため）
                    const dist = new THREE.Vector2(bullet.mesh.position.x, bullet.mesh.position.z)
                        .distanceTo(new THREE.Vector2(enemy.mesh.position.x, enemy.mesh.position.z));

                    // スキル大魔導弾なら1.5、通常弾なら1.0の距離以内で「ヒット」とみなす
                    const hitRadius = bullet.isSkill ? 1.5 : 1.0;

                    if (dist < hitRadius)
                    {
                        if (bullet.isSkill)
                        {
                            // スキル弾なら大爆発を発動
                            bullet.explode(this.enemies, this);
                        } else
                        {
                            // 通常弾なら、当たったその敵単体にダメージを与え、紫の火花を散らす
                            enemy.takeDamage(bullet.damage, bullet.mesh.position);
                            this.player.gainSkill(15); // 通常弾命中でスキルゲージを溜める
                            this.createParticleEffect(bullet.mesh.position, 0xaa00ff, 12);
                        }

                        // 当たった弾を消滅させて配列から取り除く
                        bullet.destroy();
                        this.bullets.splice(i, 1);
                        break; // この弾の判定は終了。次の弾の処理へ
                    }
                }
            }
            // B. 敵が撃った弾の場合 → プレイヤーとの当たり判定
            else
            {
                const dist = new THREE.Vector2(bullet.mesh.position.x, bullet.mesh.position.z)
                    .distanceTo(new THREE.Vector2(this.player.mesh.position.x, this.player.mesh.position.z));

                // 敵の弾がプレイヤーの半径1.0以内に近づいたらヒット
                if (dist < 1.0)
                {
                    // 【重複バグ修正】：第3引数にボスのスキル弾かどうかのフラグを渡して、PlayerのtakeDamageを呼び出すだけにする
                    this.player.takeDamage(bullet.damage, bullet.mesh.position, bullet.isSkill || false);

                    // ❌【削除】：ここで直接 createPlayerDamagePopup を呼んでいたブロックを消去！
                    // ポップアップ生成はプレイヤー側の takeDamage が「一律安全に」実行します。

                    // 被弾した場所に敵の魔力カラー（黄色）の火花を散らす
                    this.createParticleEffect(bullet.mesh.position, 0xdddd33, 12);

                    // 弾を消去
                    bullet.destroy();
                    this.bullets.splice(i, 1);
                }
            }
        }

        // --- 4. 敵キャラクターのAI更新 ＆ 死亡判定 ---
        for (let i = this.enemies.length - 1; i >= 0; i--)
        {
            const enemy = this.enemies[i];

            // 頭上のHPバー描画を正常に行うため、引数にカメラを渡して更新
            enemy.update(this.camera);

            // 敵の移動直後にステージ・障害物との衝突判定（押し戻し）を適用
            if (this.stage)
            {
                const enemyRadius = enemy.type === 'melee' ? 0.5 : 0.4;
                this.stage.checkCollision(enemy.mesh, enemyRadius);
            }

            // 敵のHPが0以下（死亡）になった場合の処理
            if (enemy.hp <= 0)
            {
                // 撃破された場所に赤い血しぶき風のパーティクルを散らす
                this.createParticleEffect(enemy.mesh.position, 0xff0000, 15);
                enemy.destroy(); // 3D空間から消去
                this.enemies.splice(i, 1); // 管理配列から削除
                this.player.score++; // スコア（討伐数）を加算
            }
        }

        // --- 5. パーティクル（エフェクト粒子）の移動と寿命更新 ---
        for (let i = this.particles.length - 1; i >= 0; i--)
        {
            const p = this.particles[i];
            p.mesh.position.add(p.vel); // 初速度に従って動かす
            p.life--; // 寿命を減らす

            // 寿命が尽きたエフェクトは空間から消す
            if (p.life <= 0)
            {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }

        // すべてのオブジェクトの位置が更新し終わったら、最新の状態で画面を1コマレンダリング（再描画）
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * 外部（UIなど）からゲームの一時停止/再開を切り替える
     */
    setPause(pause)
    {
        this.isPaused = pause;
    }

    /**
     * 新しいWaveの開始処理
     */
    startNextWave()
    {
        this.waveState = 'spawning';
        this.spawnedCount = 0;

        // Wave数に応じて敵の数を調整
        if (this.currentWave === 1)
        {
            this.waveEnemyCount = 4;
        }
        else if (this.currentWave === 2)
        {
            this.waveEnemyCount = 7;
        }
        else if (this.currentWave === 3)
        {
            this.waveEnemyCount = 4; // 【修正】ボス1体 + 取り巻き3体 = 計4体
        }

        // ✨【UI連携】画面上部カウンターを現在のWaveに更新
        const waveHud = document.getElementById('wave-hud');
        if (waveHud)
        {
            waveHud.innerText = `WAVE ${this.currentWave}`;
        }

        // ✨【UI連携】画面中央にWave開始アナウンスをポップアップ表示
        const announce = document.getElementById('wave-announce');
        if (announce)
        {
            if (this.currentWave === this.maxWave)
            {
                announce.innerText = "⚠️ BOSS WAVE START ⚠️";
                announce.style.color = "#ff3333"; // ボス戦は赤文字で警告
            } else
            {
                announce.innerText = `WAVE ${this.currentWave} START`;
                announce.style.color = "#ffcc00"; // 通常はゴールド
            }
            announce.style.display = "block";

            // 2秒後にアナウンスを自動で消去するタイマー
            setTimeout(() =>
            {
                // まだインターバル状態に移行していなければ非表示にする（重複上書き防止）
                if (this.waveState !== 'interval' && this.isPlaying)
                {
                    announce.style.display = "none";
                }
            }, 2000);
        }

        console.log(`WAVE ${this.currentWave} 開始！ 敵の数: ${this.waveEnemyCount}`);

        // === 敵の生成処理 ===
        if (this.currentWave < 3)
        {
            // 【修正】出し惜しみせず、このWaveに必要な敵（4体または7体）を最初から一気に全頭生成する
            for (let i = 0; i < this.waveEnemyCount; i++)
            {
                this.spawnEnemy();
            }
            this.waveState = 'playing';
        }
        else
        {
            // === Wave 3 (ボス戦) の処理 ===
            // ① ボス本体を生成（引数 true）
            this.spawnEnemy(true);

            // ② 【追加】ボスの取り巻き（ザコ敵）3体を同時に生成（引数 false）
            for (let i = 0; i < 3; i++)
            {
                this.spawnEnemy(false);
            }

            this.waveState = 'playing';
        }
    }

    /**
     * 毎フレームのWave進行チェック（全滅検知とインターバル管理）
     */
    checkWaveProgress()
    {
        // 1. 戦闘中、かつ画面上の敵が全滅したかをチェック
        if (this.waveState === 'playing' && this.enemies.length === 0)
        {
            // まだ規定のスポーン数に達していない場合は追加でスポーンさせる（Wave2用など）
            if (this.spawnedCount < this.waveEnemyCount)
            {
                this.spawnEnemy();
                return;
            }

            // 全滅していればインターバル（休憩）へ移行
            if (this.currentWave < this.maxWave)
            {
                this.waveState = 'interval';
                this.waveTimer = 60 * 5; // 5秒間のインターバル（60fps × 5秒 = 300フレーム）
                console.log("Waveクリア！次のWaveまでインターバル。");
            } else
            {
                // すべてのWave（ボス含む）をクリアした場合
                this.waveState = 'cleared';
                console.log("全Waveクリア！ゲーム勝利！");

                this.gameOver(true); // 🏆 ボス撃破によるゲームクリア！
                return;
            }
        }

        // 2. インターバル中のカウントダウン処理
        if (this.waveState === 'interval')
        {
            this.waveTimer--;

            // ✨【UI連携】中央にカウントダウン秒数をリアルタイム表示
            const announce = document.getElementById('wave-announce');
            if (announce)
            {
                const remainingSeconds = Math.ceil(this.waveTimer / 60);
                announce.innerText = `NEXT WAVE IN ${remainingSeconds}`;
                announce.style.color = "#ffffff";
                announce.style.display = "block";
            }

            if (this.waveTimer <= 0)
            {
                // 5秒経過したら次のWaveへ
                this.currentWave++;
                this.startNextWave();
            }
        }
    }

    /**
     * ステージ上のすべてのオブジェクトを完全に消去し、配列を空にする（初期化用）
     */
    clearScene()
    {
        // 敵ポップ用の定時タイマー（インターバル）をストップ
        clearInterval(this.spawnTimer);

        // 3D空間からの除去とメモリ解放
        this.enemies.forEach(e => e.destroy());
        this.particles.forEach(p => this.scene.remove(p.mesh));
        this.bullets.forEach(b => b.destroy());

        // 残っているビジュアルエフェクトの破棄
        this.visualEffects.forEach(fx =>
        {
            this.scene.remove(fx.mesh);
            fx.mesh.geometry.dispose();
            fx.mesh.material.dispose();
        });

        // 古いステージがある場合、障害物を安全に完全削除する
        if (this.stage)
        {
            this.stage.destroy();
        }

        // シーン内に残ってしまっている古いメッシュ（床や壁、障害物の残骸）を強制一掃
        for (let i = this.scene.children.length - 1; i >= 0; i--)
        {
            const child = this.scene.children[i];

            // プレイヤーと照準リング以外の、ステージを構成していたメッシュやヘルパーを強制消去
            if (child.userData.isObstacle ||
                (child instanceof THREE.Mesh && child !== this.reticle && (!this.player || child !== this.player.mesh)))
            {
                this.scene.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material)
                {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            }
        }
        this.stage = null;

        // 配列を空っぽに初期化
        this.enemies = [];
        this.particles = [];
        this.bullets = [];
        this.visualEffects = []; // 初期化

        if (this.reticle)
        {
            this.reticle.visible = false;
        }

        // プレイヤーのインスタンスも削除
        if (this.player)
        {
            this.player.destroy();
            this.player = null;
        }

        // ✨【UI連携】Wave関連のHUDUIを非表示にクリーンアップ
        const waveHud = document.getElementById('wave-hud');
        const waveAnnounce = document.getElementById('wave-announce');
        if (waveHud) waveHud.classList.remove('active');
        if (waveAnnounce) waveAnnounce.style.display = 'none';
    }

    /**
     * ウィンドウサイズが変更された時、画面が引き伸ばされないようにカメラの比率を修正する
     */
    onResize()
    {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * ゲーム終了（ゲームオーバーまたはゲームクリア）を処理する統合メソッド
     * @param {boolean} isWin - クリア（勝利）した場合はtrue、ゲームオーバー（敗北）はfalse
     */
    gameOver(isWin = false)
    {
        this.isPlaying = false;

        // プレイヤーの更新を止めるために状態をロック
        if (this.player)
        {
            this.player.isDead = true;
        }

        // HTML上のUI要素（タイトル、リザルト画面）を自動検出
        const resultScreen = document.getElementById('game-over-screen') || document.getElementById('result-screen');
        const resultTitle = document.getElementById('game-over-title') || document.getElementById('result-title') || (resultScreen ? resultScreen.querySelector('h1') : null);
        const scoreValue = document.getElementById('score-value') || document.getElementById('final-score');

        // 1. リザルト画面を表示する
        if (resultScreen)
        {
            resultScreen.style.display = 'flex';
            resultScreen.classList.add('active');
        }

        // 2. 勝敗（クリアか否か）に応じてテキストと見た目を華やかに切り替える
        if (resultTitle)
        {
            if (isWin)
            {
                resultTitle.innerText = "🏆 GAME CLEAR 🏆";
                resultTitle.style.color = "#ffcc00"; // ゴージャスなゴールド色
                resultTitle.style.textShadow = "0 0 10px #ffcc00, 0 0 20px #ffaa00, 0 0 40px #ff3300";
            }
            else
            {
                resultTitle.innerText = "💥 GAME OVER 💥";
                resultTitle.style.color = "#ff3333"; // 危険・敗北を現すレッド色
                resultTitle.style.textShadow = "0 0 10px #ff3333, 0 0 20px #990000";
            }
        }

        // 3. 最終討伐スコアを画面に反映
        if (scoreValue && this.player)
        {
            scoreValue.innerText = this.player.score;
        }

        // 4. 既存のコールバックがあれば通知する（シーンマネージャーとの互換性維持）
        if (this.onGameOverCallback)
        {
            this.onGameOverCallback(this.player ? this.player.score : 0, isWin);
        }
    }

    /**
     * プレイヤーの被ダメージポップアップを画面上に生成する
     * @param {number} amount - ダメージ数値
     * @param {THREE.Vector3} position - プレイヤーの現在位置
     * @param {boolean} isBoss - ボスからの攻撃かどうか
     */
    createPlayerDamagePopup(amount, position, isBoss)
    {
        // 1. HTML要素（DOM）の作成
        const popup = document.createElement('div');
        popup.innerText = Math.round(amount);

        // 2. スタイリング（プレイヤー被弾は危険を表す赤！）
        popup.style.position = 'absolute';
        popup.style.color = '#ff3333'; // 鮮烈な赤
        popup.style.fontWeight = 'bold';
        popup.style.fontFamily = 'Arial, sans-serif';
        // 黒い縁取りをつけて、どんな背景でも数字を見やすくする
        popup.style.textShadow = '2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000';
        popup.style.pointerEvents = 'none';
        popup.style.userSelect = 'none';
        popup.style.zIndex = '9999';

        // 3. サイズ決定（ボス攻撃ならさらに大きくして危機感を演出！）
        const baseFontSize = isBoss ? 34 : 24;
        popup.style.fontSize = `${baseFontSize}px`;

        document.body.appendChild(popup);

        // 4. アニメーション用の初期パラメータ（左右に激しく飛び散る）
        const startTime = Date.now();
        const duration = 800; // 0.8秒で消滅

        // 飛び散る速度（ボスの方がより激しく弾け飛ぶ）
        const speedMultiplier = isBoss ? 6 : 4;
        const velX = (Math.random() - 0.5) * speedMultiplier;
        const velY = (isBoss ? 7 : 5) + Math.random() * 3; // 上方向への初速

        let offsetX = 0;
        let offsetY = 0;

        // 3D位置の複製（プレイヤーが移動しても、ポップアップはその場に残って飛び散る）
        const initialPos = position.clone();
        initialPos.y += 1.2; // プレイヤーの胸・頭あたりから湧き出させる

        // 5. アニメーションのループ処理
        const animate = () =>
        {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;

            // 寿命が尽きたら要素を消去して終了
            if (progress >= 1.0)
            {
                popup.remove();
                return;
            }

            // 万が一カメラなどが消失していた場合の安全ガード
            if (!this.camera)
            {
                popup.remove();
                return;
            }

            // 重力と速度のシミュレーション
            const t = elapsed / 1000;
            offsetX += velX;
            // 初速から重力（15）による落下を計算
            const currentVelY = velY - (15 * t);
            offsetY += currentVelY;

            // 3D空間の座標を、2Dの画面スクリーン座標に変換（投影）
            const popupPos = initialPos.clone();
            popupPos.project(this.camera);

            // カメラの背後にある場合は非表示、前方にある場合は画面に描画
            if (popupPos.z > 1)
            {
                popup.style.display = 'none';
            } else
            {
                popup.style.display = 'block';

                // 投影された-1〜1の座標を画面のピクセル位置（左上0,0）に換算
                const x = (popupPos.x * .5 + 0.5) * window.innerWidth;
                const y = (-(popupPos.y * 0.5) + 0.5) * window.innerHeight;

                // 計算した物理挙動のオフセットを加算して表示位置を決定
                popup.style.left = `${x + offsetX - (baseFontSize / 2)}px`;
                popup.style.top = `${y - offsetY}px`;

                // 後半にかけて徐々に透明にする（フェードアウト）
                if (progress > 0.5)
                {
                    popup.style.opacity = `${1.0 - (progress - 0.5) * 2}`;
                }
            }

            // 次のフレームも継続してアニメーションを実行
            requestAnimationFrame(animate);
        };

        // ループを開始
        requestAnimationFrame(animate);
    }
}