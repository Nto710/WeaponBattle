class Bullet
{
    /**
     * 弾丸クラスのコンストラクタ（初期化処理）
     * @param {THREE.Scene} scene - 3Dの空間（シーン）
     * @param {THREE.Vector3} position - 発射された瞬間の初期位置（X, Y, Z）
     * @param {THREE.Vector3} direction - 弾が飛んでいく方角のベクトル
     * @param {number} speed - 弾の移動速度
     * @param {number} damage - 命中時に与えるダメージ量
     * @param {boolean} isPlayerBullet - プレイヤーが撃った弾ならtrue、敵の弾ならfalse
     * @param {number} color - 弾の見た目の色（16進数カラーコード）
     * @param {number} size - 弾の立方体（Cube）のサイズ
     * @param {boolean} isSkill - 通常弾ならfalse、大魔法のスキル弾ならtrue
     */
    constructor(scene, position, direction, speed, damage, isPlayerBullet, color = 0xffff00, size = 0.4, isSkill = false)
    {
        this.scene = scene;
        this.damage = damage;
        this.isPlayerBullet = isPlayerBullet;
        this.isDead = false; // 弾がすでに消滅しているかどうかのフラグ
        this.isSkill = isSkill;

        this.speed = speed;

        // 進行方向ベクトルを複製（clone）し、長さを1に正規化（normalize）する
        // これにより、どの斜め方向に飛んでも移動速度が一定になります
        this.direction = direction.clone().normalize();

        // --- 1. 弾丸の3Dモデル（Cube）の作成 ---
        // 箱（立方体）の形状を定義
        const geometry = new THREE.BoxGeometry(size, size, size);

        // 材質（マテリアル）の設定。スキル弾の場合は半透明にする
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: isSkill,       // 透明度を有効にするか
            opacity: isSkill ? 0.8 : 1.0 // スキル弾なら不透明度0.8（少し透ける）、通常弾なら1.0（不透明）
        });

        // 形状と材質を合体させて、画面に表示できる「メッシュ」を作成
        this.mesh = new THREE.Mesh(geometry, material);

        // --- 2. 発射位置の調整 ---
        // キャラクターの中心位置をコピー
        this.mesh.position.copy(position);
        // 足元から弾が出ないように、Y座標（高さ）を一律1.0（胸の高さ）に設定
        this.mesh.position.y = 1.0;

        // 作成した弾の3Dモデルをゲームの3D空間に追加（これで画面に見えるようになる）
        this.scene.add(this.mesh);

        // --- 3. 寿命（射程距離）の設定 ---
        // 画面外に無限に飛んでいって重くならないよう、フレーム数で寿命を設定
        this.life = 120; // 60fps（1秒間に60コマ）のゲームなら、約2秒間で自動消滅
    }

    /**
     * 毎フレーム実行される移動・更新処理
     * GameCoreクラスのupdateループから呼び出されます
     */
    update()
    {
        // すでに消滅している弾なら、これ以降の移動処理をスキップ
        if (this.isDead)
        {
            return;
        }

        // 【移動】現在の座標に対して、進行方向（direction）へ速度（speed）分だけ座標を加算する
        this.mesh.position.addScaledVector(this.direction, this.speed);

        // 【演出】スキル弾（大魔導弾）の場合のみ、飛びながら縦横にぐるぐる回転させる
        if (this.isSkill)
        {
            this.mesh.rotation.x += 0.05;
            this.mesh.rotation.y += 0.08;
        }

        // 【寿命のカウントダウン】毎フレーム1ずつ減らし、0になったら消滅させる
        this.life--;
        if (this.life <= 0)
        {
            this.destroy();
        }
    }

    /**
     * 魔法スキル（大魔導弾）が敵に着弾した時の大爆発＆範囲ダメージ処理
     * @param {Array} enemies - 現在ステージに存在する敵の配列
     * @param {GameCore} gameCore - メインのゲームシステムへの参照
     */
    explode(enemies, gameCore)
    {
        // 通常弾だった場合は爆発しないようにガード
        if (!this.isSkill) return;

        // 1. 【視覚演出】着弾地点を中心に、水色（40個）と青（20個）の立方体パーティクルを大量に散らす
        gameCore.createParticleEffect(this.mesh.position, 0x00ffff, 40);
        gameCore.createParticleEffect(this.mesh.position, 0x00aaff, 20);

        // 2. 【範囲攻撃】着弾地点から「半径 5.0」以内の敵全員を巻き込む
        enemies.forEach(enemy =>
        {
            // 弾と敵の3次元的な距離を測定
            const dist = this.mesh.position.distanceTo(enemy.mesh.position);

            // 半径5.0以内なら、その敵にもダメージと凍結を付与
            if (dist <= 5.0)
            {
                // 🔴【連動修正】敵の takeDamage に「爆発の中心地（弾の位置）」を教えてノックバックさせる！
                enemy.takeDamage(this.damage, this.mesh.position); // スキル大ダメージ（60）
                enemy.freeze(3000);            // 3秒間凍結（足止め）
            }
        });

        // 3. 【カメラ演出】大魔法の衝撃を表現するため、画面を大きく揺らす
        gameCore.triggerScreenShake();
    }

    /**
     * 弾丸を安全に消滅させる処理
     */
    destroy()
    {
        // 二重に消滅処理が走らないようにチェック
        if (this.isDead) return;

        this.isDead = true;
        // 3D空間（シーン）から、弾丸の見た目（メッシュ）を取り除く
        this.scene.remove(this.mesh);
    }
}