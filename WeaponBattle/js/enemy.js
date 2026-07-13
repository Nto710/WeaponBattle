/**
 * 敵キャラクターを管理するクラス
 * プレイヤーへの追従AI、通常攻撃（近接・遠隔・ボス）、被弾、大魔法による凍結（スタン）処理、
 * および頭上のHPバー描画を制御します。
 */
class Enemy
{
    /**
     * 敵の初期化処理（コンストラクタ）
     * @param {THREE.Scene} scene - 3Dの空間（シーン）
     * @param {Player} player - ターゲットとなるプレイヤーのインスタンス
     * @param {string} type - 敵のタイプ ('melee':近接型, 'range':遠隔型, 'boss':ボス型)
     * @param {THREE.Vector3} position - 出現する初期座標（X, Y, Z）
     */
    constructor(scene, player, type, position)
    {
        this.scene = scene;
        this.player = player;
        this.type = type;

        // 敵のタイプに応じたステータス設定
        if (type === 'boss')
        {
            this.hp = 500;                // ボス用の膨大なHP
            this.speed = 0.02;             // 少し重厚で遅い移動速度
            this.attackRange = 10.0;       // 弾幕を撃ち始める長距離射程
            this.damage = 15;              // 一撃が重い攻撃力
            this.attackCooldown = 3000;    // スキル使用周期（3秒）
        } else
        {
            this.hp = type === 'melee' ? 50 : 30;
            this.speed = type === 'melee' ? 0.05 : 0.03;
            this.attackRange = type === 'melee' ? 1.5 : 7.0;
            this.damage = type === 'melee' ? 10 : 8;
            this.attackCooldown = 1500;    // 通常敵は1.5秒
        }

        this.maxHp = this.hp; // ★最大HPを記録（HPバーの割合計算用）
        this.lastAttackTime = 0;

        // 魔法スキルによる凍結（スタン）状態の管理フラグ
        this.isFrozen = false;
        this.freezeEndTime = 0;

        // --- 近接攻撃のステート管理（setTimeout排除用） ---
        this.attackState = 'idle'; // 'idle', 'anticipating', 'recovering'
        this.attackTimer = 0;
        this.anticipationTime = 600; // 予兆にかける時間（0.6秒）
        this.recoveryTime = 200;     // 後隙にかける時間（0.2秒）

        // 遠隔型の攻撃演出タイマー
        this.rangeAttackVisualTimer = 0;

        // 被弾時の白点滅タイマー
        this.hitFlashTimer = 0;

        // 敵自身のノックバック用変数（プレイヤーの攻撃で吹っ飛ぶための準備）
        this.knockbackVelocity = new THREE.Vector3();

        // GameCoreからの機能（遠隔弾の発射など）を使うための参照窓口
        this.gameCore = null;

        // --- 1. 敵の3Dモデル生成 ---
        let color;

        // 【修正点①】 geometryをインスタンス変数(this.geometry)として保持するように変更
        if (type === 'boss')
        {
            this.geometry = new THREE.BoxGeometry(3.0, 3.0, 3.0);
            color = 0x8800ff;
        }
        else if (type === 'melee')
        {
            this.geometry = new THREE.BoxGeometry(0.8, 1.6, 0.8);
            color = 0xff3333;
        }
        else
        {
            this.geometry = new THREE.SphereGeometry(0.5, 16, 16);
            color = 0xdddd33;
        }

        this.material = new THREE.MeshLambertMaterial({ color: color });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.copy(position);

        // 地面にめり込まないよう、形状の高さの半分だけY座標を上げる
        if (type === 'boss') this.mesh.position.y = 1.5;
        else if (type === 'melee') this.mesh.position.y = 0.8;
        else this.mesh.position.y = 0.5;

        this.scene.add(this.mesh);

        // --- 2. 頭上HPバーの生成 ---
        const barWidth = type === 'boss' ? 3.6 : 1.2;
        const barHeight = type === 'boss' ? 0.25 : 0.12;

        // A. バーの土台（背景の黒い長方形ボックス）
        const barBgGeo = new THREE.BoxGeometry(barWidth, barHeight, 0.05);
        const barBgMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        this.hpBarBg = new THREE.Mesh(barBgGeo, barBgMat);

        this.scene.add(this.hpBarBg);

        // B. 体力残量（緑色の長方形ボックス）
        const barGreenGeo = new THREE.BoxGeometry(barWidth, barHeight, 0.05);
        this.hpBarGreenMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 }).clone();
        this.hpBarGreen = new THREE.Mesh(barGreenGeo, this.hpBarGreenMat);

        this.hpBarGreen.position.set(0, 0, 0.01);
        this.hpBarBg.add(this.hpBarGreen);
    }

    /**
     * 毎フレーム実行されるAI・移動更新処理
     * @param {THREE.Camera} camera - 常に正面を向かせるためのカメラオブジェクト
     */
    update(camera)
    {
        // 既に破棄されている場合は一切の処理を行わない（安全対策）
        if (!this.mesh) return;

        const now = Date.now();

        // --- 敵のHPバーの位置と向きの完全同期（ビルボード処理） ---
        const activeCamera = camera || (typeof camera !== 'undefined' ? camera : this.gameCore?.camera);
        if (activeCamera && this.hpBarBg)
        {
            let barOffset = 0.8;
            if (this.type === 'boss') barOffset = 2.2;
            else if (this.type === 'melee') barOffset = 1.2;

            this.hpBarBg.position.set(this.mesh.position.x, this.mesh.position.y + barOffset, this.mesh.position.z);
            this.hpBarBg.quaternion.copy(activeCamera.quaternion);
        }

        // 凍結状態（スタン中）のチェック
        if (this.isFrozen)
        {
            if (now > this.freezeEndTime)
            {
                this.isFrozen = false;
                this.updateAppearance();
            }
            else
            {
                // 【修正点③】 凍結中もノックバック減衰だけはさせておかないと、解凍後に突然吹っ飛ぶためここで処理
                this.knockbackVelocity.multiplyScalar(0.85);
                return; // 凍結中は移動も攻撃もすべてスキップ（完全停止）
            }
        }

        // --- 各種タイマー・演出のフレーム更新処理（setTimeoutの代替） ---
        this.updateTimers(now);

        // 近接敵が攻撃動作中（予兆・後隙）は移動AIをストップ
        if (this.type === 'melee' && this.attackState !== 'idle')
        {
            if (this.knockbackVelocity.lengthSq() > 0.0001)
            {
                this.mesh.position.add(this.knockbackVelocity);
                this.knockbackVelocity.multiplyScalar(0.85);
            }
            this.handleObstacleCollision();
            return;
        }

        // 敵自身のノックバック力の適用と減衰（摩擦）
        if (this.knockbackVelocity.lengthSq() > 0.0001)
        {
            this.mesh.position.add(this.knockbackVelocity);
            this.knockbackVelocity.multiplyScalar(0.85);
        }

        // プレイヤーとの現在の3次元的な直線距離を測定
        const dist = this.mesh.position.distanceTo(this.player.mesh.position);

        // 敵の体を常にプレイヤーの方向へ向かせる
        this.mesh.lookAt(this.player.mesh.position.x, this.mesh.position.y, this.player.mesh.position.z);

        // --- 移動AI判定 ---
        if (dist > this.attackRange)
        {
            const dir = new THREE.Vector3().subVectors(this.player.mesh.position, this.mesh.position).normalize();
            this.mesh.position.x += dir.x * this.speed;
            this.mesh.position.z += dir.z * this.speed;
        }
        else
        {
            this.attack(now);

            // ボスの場合、弾幕展開中も通常の半分の速度で接近
            if (this.type === 'boss')
            {
                const dir = new THREE.Vector3().subVectors(this.player.mesh.position, this.mesh.position).normalize();
                this.mesh.position.x += dir.x * (this.speed * 0.5);
                this.mesh.position.z += dir.z * (this.speed * 0.5);
            }
        }
        this.handleObstacleCollision();
    }

    /**
     * フレーム毎のタイマー制御と見た目の更新を行うメソッド
     */
    updateTimers(now)
    {
        // 1. 被弾時の白点滅タイマー処理
        if (this.hitFlashTimer > 0 && now > this.hitFlashTimer)
        {
            this.hitFlashTimer = 0;
            this.updateAppearance();
        }

        // 2. 遠隔型の浮き上がり演出タイマー処理
        if (this.type === 'range' && this.rangeAttackVisualTimer > 0)
        {
            if (now > this.rangeAttackVisualTimer)
            {
                this.mesh.position.y = 0.5; // 元の高さに戻す
                this.rangeAttackVisualTimer = 0;
            }
        }

        // 3. 近接型の通常攻撃ステートマシンの更新
        if (this.type === 'melee' && this.attackState !== 'idle')
        {
            if (this.attackState === 'anticipating' && now > this.attackTimer)
            {
                // 【予兆終了 ➔ 攻撃本番】
                this.attackState = 'recovering';
                this.attackTimer = now + this.recoveryTime;

                // 【修正点②】 直接色を変えず、カラー適用ロジックを一元化
                this.mesh.scale.set(0.7, 1.4, 0.7);
                this.updateAppearance();

                // ヒット判定チェック
                const finalDist = this.mesh.position.distanceTo(this.player.mesh.position);
                if (finalDist <= this.attackRange + 0.5)
                {
                    this.player.takeDamage(this.damage, this.mesh.position);

                    if (this.gameCore)
                    {
                        this.gameCore.triggerScreenShake();
                    }
                }
            }
            else if (this.attackState === 'recovering' && now > this.attackTimer)
            {
                // 【後隙終了 ➔ アイドル（通常状態）へ戻る】
                this.attackState = 'idle';
                this.mesh.scale.set(1, 1, 1);
                this.updateAppearance();
            }
        }
    }

    /**
     * 現在の状態（凍結・通常・タイプ別）に合わせてエネミー本来の色に塗り直すメソッド
     */
    updateAppearance()
    {
        if (!this.mesh) return;

        // 被弾点滅中は最優先で白にする
        if (this.hitFlashTimer > 0)
        {
            this.material.color.setHex(0xffffff);
            return;
        }

        if (this.isFrozen)
        {
            this.material.color.setHex(0x00ffff); // 凍結時は水色
            return;
        }

        // 攻撃ステートによる色変化（近接のみ）
        if (this.type === 'melee')
        {
            if (this.attackState === 'anticipating')
            {
                this.material.color.setHex(0xff0000); // 予兆は真っ赤
                return;
            }
            if (this.attackState === 'recovering')
            {
                this.material.color.setHex(0xffffff); // 本番は白
                return;
            }
        }

        // 通常時のデフォルト色
        let defaultColor = 0xdddd33; // range
        if (this.type === 'boss') defaultColor = 0x8800ff;
        else if (this.type === 'melee') defaultColor = 0xff3333;

        this.material.color.setHex(defaultColor);
    }

    /**
     * ステージ上の障害物との衝突判定および押し戻し処理
     */
    handleObstacleCollision()
    {
        if (this.gameCore && this.gameCore.obstacles && this.mesh)
        {
            const myRadius = this.type === 'boss' ? 2.2 : 0.5;

            this.gameCore.obstacles.forEach(obstacle => 
            {
                const diffX = this.mesh.position.x - obstacle.position.x;
                const diffZ = this.mesh.position.z - obstacle.position.z;
                const distanceSq = diffX * diffX + diffZ * diffZ;

                const obstacleRadius = obstacle.radius || 1.0;
                const minDistance = myRadius + obstacleRadius;

                if (distanceSq < minDistance * minDistance)
                {
                    const currentDist = Math.sqrt(distanceSq);
                    if (currentDist > 0)
                    {
                        const overlap = minDistance - currentDist;
                        const pushX = (diffX / currentDist) * overlap;
                        const pushZ = (diffZ / currentDist) * overlap;

                        this.mesh.position.x += pushX;
                        this.mesh.position.z += pushZ;
                    }
                }
            });
        }
    }

    /**
     * プレイヤーへの攻撃を開始するメソッド
     * @param {number} now - 現在のタイムスタンプ
     */
    attack(now)
    {
        if (now - this.lastAttackTime < this.attackCooldown)
        {
            return;
        }

        // 近接型が既に攻撃演出中の場合は重ねて発動しない
        if (this.type === 'melee' && this.attackState !== 'idle')
        {
            return;
        }

        this.lastAttackTime = now;

        // ==================== ボス専用攻撃分岐 ====================
        if (this.type === 'boss')
        {
            if (!this.gameCore) return;

            const skillChoice = Math.random();

            if (skillChoice < 0.5) 
            {
                // 【ボススキル①: 全方位リング弾幕】
                const bulletCount = 32;
                for (let i = 0; i < bulletCount; i++)
                {
                    const angle = (i / bulletCount) * Math.PI * 2;
                    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

                    const spawnPos = this.mesh.position.clone();
                    spawnPos.y = 1.0;

                    const speed = 0.22;
                    const isPlayerBullet = false;
                    const bulletColor = 0xff00ff;
                    const bulletSize = 0.4;
                    const isSkill = true;

                    this.gameCore.spawnBullet(
                        spawnPos,
                        direction,
                        speed,
                        this.damage,
                        isPlayerBullet,
                        bulletColor,
                        bulletSize,
                        isSkill
                    );
                }
                this.gameCore.triggerScreenShake();
            }
            else 
            {
                // 【ボススキル②: 3連バーストショット】
                let shotsFired = 0;
                const fireInterval = setInterval(() =>
                {
                    // 安全チェック: インターバル中に自身が死亡・破棄されていたら完全にクリアする
                    if (!this.mesh || this.hp <= 0 || this.isFrozen)
                    {
                        clearInterval(fireInterval);
                        return;
                    }

                    const spawnPos = this.mesh.position.clone();
                    spawnPos.y = 1.0;

                    const direction = new THREE.Vector3().subVectors(this.player.mesh.position, spawnPos).normalize();
                    this.gameCore.spawnBullet(spawnPos, direction, 0.25, this.damage, false, 0x00ffff);
                    shotsFired++;

                    if (shotsFired >= 3)
                    {
                        clearInterval(fireInterval);
                    }
                }, 150);
            }
        }
        // ==================== 通常遠隔型 ====================
        else if (this.type === 'range')
        {
            // Y軸を跳ね上げる演出（update側で時間経過で戻す）
            this.mesh.position.y = 0.8;
            this.rangeAttackVisualTimer = now + 100;

            const direction = new THREE.Vector3().subVectors(this.player.mesh.position, this.mesh.position).normalize();
            if (this.gameCore)
            {
                this.gameCore.spawnBullet(this.mesh.position, direction, 0.15, this.damage, false, 0xdddd33);
            }
        }
        // ==================== 通常近接型 ====================
        else
        {
            // 【状態遷移: 予兆（タメ）開始】
            this.attackState = 'anticipating';
            this.attackTimer = now + this.anticipationTime;

            this.mesh.scale.set(1.2, 0.7, 1.2);
            this.updateAppearance();
        }
    }

    /**
     * プレイヤーの通常攻撃や大魔法を受けてダメージを処理するメソッド
     */
    takeDamage(amount, attackerPosition)
    {
        if (this.hp <= 0) return;

        this.hp -= amount;
        this.createDamagePopup(amount);

        // ノックバック計算
        if (attackerPosition && this.mesh)
        {
            const dir = new THREE.Vector3().subVectors(this.mesh.position, attackerPosition);
            dir.y = 0;
            dir.normalize();

            const knockbackForce = this.type === 'boss' ? 0.06 : 0.3;
            this.knockbackVelocity.copy(dir.multiplyScalar(knockbackForce));
        }

        // --- HPバーの長さ＆色のリアルタイム更新 ---
        const hpPercent = Math.max(0, this.hp / this.maxHp);

        if (this.hpBarGreen)
        {
            this.hpBarGreen.scale.x = hpPercent;
            const baseHalfWidth = this.type === 'boss' ? -1.8 : -0.6;
            this.hpBarGreen.position.x = (1 - hpPercent) * baseHalfWidth;
        }

        if (this.hpBarGreenMat)
        {
            if (hpPercent <= 0.2) this.hpBarGreenMat.color.setHex(0xff3333);
            else if (hpPercent <= 0.5) this.hpBarGreenMat.color.setHex(0xdddd33);
        }

        // 被弾時の白点滅演出をタイマー方式に変更 (100ミリ秒間)
        if (this.mesh)
        {
            this.hitFlashTimer = Date.now() + 100;
            this.updateAppearance();
        }
    }

    /**
     * 敵の頭上にダメージ数値をポップアップさせる処理（HTML/DOM方式）
     */
    createDamagePopup(amount)
    {
        if (!this.mesh || !this.gameCore || !this.gameCore.camera) return;

        const popupPos = this.mesh.position.clone();
        popupPos.y += this.type === 'boss' ? 3.5 : 1.8;

        popupPos.project(this.gameCore.camera);

        const x = (popupPos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (popupPos.y * -0.5 + 0.5) * window.innerHeight;

        const damageDiv = document.createElement('div');
        damageDiv.innerText = amount;

        damageDiv.style.position = 'absolute';
        damageDiv.style.left = `${x}px`;
        damageDiv.style.top = `${y}px`;
        damageDiv.style.color = this.type === 'boss' ? '#ffcc00' : '#ffffff';
        damageDiv.style.fontWeight = 'bold';
        damageDiv.style.fontSize = this.type === 'boss' ? '28px' : '20px';
        damageDiv.style.fontFamily = 'monospace';
        damageDiv.style.textShadow = '2px 2px 0px #000';
        damageDiv.style.pointerEvents = 'none';
        damageDiv.style.transform = 'translate(-50%, -50%)';
        damageDiv.style.transition = 'all 0.6s ease-out';

        document.body.appendChild(damageDiv);

        requestAnimationFrame(() =>
        {
            damageDiv.style.top = `${y - 60}px`;
            damageDiv.style.opacity = '0';
        });

        // ここはDOM（HTML要素）の削除なので安全です
        setTimeout(() =>
        {
            damageDiv.remove();
        }, 600);
    }

    /**
     * 魔法使いのスキルによって呼び出される凍結（スタン）処理
     */
    freeze(duration)
    {
        this.isFrozen = true;
        this.freezeEndTime = Date.now() + duration;

        // 攻撃状態を強制リセットして通常スケールに戻す
        this.attackState = 'idle';
        if (this.mesh)
        {
            this.mesh.scale.set(1, 1, 1);
        }
        this.updateAppearance();
    }

    /**
     * クリーンアップ処理
     */
    destroy()
    {
        // 体力バー関連のクリーンアップ
        if (this.hpBarGreen)
        {
            this.hpBarGreen.geometry.dispose();
            this.hpBarGreenMat.dispose();
        }
        if (this.hpBarBg)
        {
            this.hpBarBg.geometry.dispose();
            this.hpBarBg.material.dispose();
            this.scene.remove(this.hpBarBg);
            this.hpBarBg = null;
        }

        // 本体メッシュと【修正点①】ジオメトリの完全解放
        if (this.mesh)
        {
            this.scene.remove(this.mesh);
            if (this.geometry) this.geometry.dispose(); // 安全に解放可能に
            if (this.material) this.material.dispose();
            this.mesh = null;
        }
    }
}