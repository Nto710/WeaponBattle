/**
 * プレイヤーキャラクターを管理するクラス
 * キーボード入力による移動、通常攻撃、スキル発動、HPやUIゲージの同期処理を行います
 */
class Player
{
    /**
     * プレイヤーの初期化処理（コンストラクタ）
     * @param {THREE.Scene} scene - 3Dの空間（シーン）
     * @param {string} weaponType - 選択された武器の種類 ('sword', 'axe', 'magic')
     */
    constructor(scene, weaponType) 
    {
        this.scene = scene;
        this.config = WeaponData[weaponType];
        this.weaponType = weaponType;

        // ステータス初期化
        this.hp = this.config.maxHp;
        this.maxHp = this.config.maxHp;
        this.skillGauge = 0;
        this.score = 0;

        this.isDead = false;
        this.lastAttackTime = 0;

        this.gameCore = null;

        // スタミナパラメータ
        this.stamina = 100;
        this.maxStamina = 100;
        this.isInvincible = false;

        this.isRunning = false;
        this.runSpeedMultiplier = 1.6;
        this.staminaDrainPerFrame = 0.4;

        this.isEvading = false;
        this.evadeSpeedMultiplier = 3.5;
        this.evadeDuration = 200;
        this.evadeStaminaCost = 30;
        this.lastEvadeTime = 0;
        this.evadeCooldown = 600;
        this.evadeDirection = new THREE.Vector3();

        // モーション管理用
        this.isAttacking = false;
        this.isUsingSkill = false;
        this.attackProgress = 0;
        this.attackDuration = 180;       // 切り裂くスピードをより鋭く（180ms）
        this.skillDuration = 500;

        // --- 1. プレイヤーの3Dモデル生成 ---
        const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 16);
        const material = new THREE.MeshLambertMaterial({ color: this.config.color });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = 1;
        this.scene.add(this.mesh);

        // --- 2. 武器の3Dモデル生成（修正：正面へ伸びる剣の定義） ---
        // 横幅(X)0.1, 高さ(Y)0.1, 長さ(Z)1.5 の、正面（-Z方向）に突き出す刀身を作ります
        const wpGeom = new THREE.BoxGeometry(0.1, 0.1, 1.5);
        // 剣の根元（0, 0, 0）を中心に回転させるため、Z方向の半分だけ前方にずらします
        wpGeom.translate(0, 0, -0.75);

        const wpMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.weaponMesh = new THREE.Mesh(wpGeom, wpMat);

        this.resetWeaponPose();
        this.mesh.add(this.weaponMesh); // プレイヤーに持たせる

        // --- 3. 入力監視 ---
        this.keys = {};
        window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);
        window.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('mousedown', (e) =>
        {
            if (this.isDead) return;
            if (e.button === 0)
            {
                if (this.gameCore) this.attack(this.gameCore.enemies, this.gameCore.createParticleEffect.bind(this.gameCore));
            }
            else if (e.button === 2)
            {
                if (this.skillGauge >= this.config.skillThreshold && this.gameCore)
                {
                    this.useSkill(
                        this.gameCore.enemies,
                        this.gameCore.triggerScreenShake.bind(this.gameCore),
                        this.gameCore.createParticleEffect.bind(this.gameCore)
                    );
                }
            }
        });

        this.knockbackVelocity = new THREE.Vector3();
        this.hpShakeTime = 0;
    }

    /**
     * 武器の初期位置・角度（構えポーズ）のリセット
     */
    resetWeaponPose()
    {
        if (!this.weaponMesh) return;

        if (this.weaponType === 'sword')
        {
            // 剣のデフォルト：右側に少し開き、斜め前を向いて構える
            this.weaponMesh.position.set(0.5, 0.3, 0.0);
            this.weaponMesh.rotation.set(0, THREE.MathUtils.degToRad(45), 0);
        } else
        {
            this.weaponMesh.position.set(0.5, 0.3, 0.0);
            this.weaponMesh.rotation.set(0, 0, 0);
        }
    }

    initHpBar()
    {
        const bgGeo = new THREE.PlaneGeometry(1.2, 0.15);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
        this.hpBgMesh = new THREE.Mesh(bgGeo, bgMat);
        this.scene.add(this.hpBgMesh);

        const barGeo = new THREE.PlaneGeometry(1.1, 0.1);
        barGeo.translate(0.55, 0, 0);
        const barMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
        this.hpBarMesh = new THREE.Mesh(barGeo, barMat);
        this.hpBarMesh.position.set(-0.55, 0, 0.01);
        this.hpBgMesh.add(this.hpBarMesh);
    }

    lookAtMouse(mouseWorldPosition)
    {
        if (!mouseWorldPosition || this.isDead) return;
        const targetDir = new THREE.Vector3().subVectors(mouseWorldPosition, this.mesh.position);
        targetDir.multiplyScalar(-1);
        const lookTarget = new THREE.Vector3().addVectors(this.mesh.position, targetDir);
        lookTarget.y = this.mesh.position.y;
        this.mesh.lookAt(lookTarget);
    }

    update(enemies, onScreenShake, createParticle, camera)
    {
        if (this.isDead) return;
        const now = Date.now();

        if (this.knockbackVelocity.lengthSq() > 0.0001)
        {
            this.mesh.position.add(this.knockbackVelocity);
            this.knockbackVelocity.multiplyScalar(0.85);
        }

        let moveX = 0;
        let moveZ = 0;
        if (this.keys['w'] || this.keys['arrowup']) moveZ -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) moveZ += 1;
        if (this.keys['a'] || this.keys['arrowleft']) moveX -= 1;
        if (this.keys['d'] || this.keys['arrowright']) moveX += 1;

        if (this.isEvading && now - this.lastEvadeTime > this.evadeDuration)
        {
            this.isEvading = false;
            this.isInvincible = false;
        }

        if (!this.isEvading && (!this.isRunning || (moveX === 0 && moveZ === 0)))
        {
            this.stamina = Math.min(this.maxStamina, this.stamina + 0.2);
        }

        let currentSpeed = this.config.speed;

        if (this.isEvading)
        {
            this.mesh.position.x += this.evadeDirection.x * (this.config.speed * this.evadeSpeedMultiplier);
            this.mesh.position.z += this.evadeDirection.z * (this.config.speed * this.evadeSpeedMultiplier);
            if (Math.random() < 0.6 && createParticle) createParticle(this.mesh.position, 0xffaa00, 1);
        }
        else if (moveX !== 0 || moveZ !== 0)
        {
            const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
            const dirX = moveX / length;
            const dirZ = moveZ / length;

            if (this.keys[' '] && now - this.lastEvadeTime > this.evadeCooldown && this.stamina >= this.evadeStaminaCost)
            {
                this.isEvading = true;
                this.isInvincible = true;
                this.lastEvadeTime = now;
                this.stamina -= this.evadeStaminaCost;
                this.evadeDirection.set(dirX, 0, dirZ);
                this.isRunning = false;
                if (createParticle) createParticle(this.mesh.position, 0xffffff, 10);
            }
            else if (this.keys['shift'] && this.stamina > this.staminaDrainPerFrame)
            {
                this.isRunning = true;
                this.stamina -= this.staminaDrainPerFrame;
                currentSpeed *= this.runSpeedMultiplier;
                if (Math.random() < 0.2 && createParticle) createParticle(this.mesh.position, 0x555555, 1);
            } else
            {
                this.isRunning = false;
            }

            if (!this.isEvading)
            {
                this.mesh.position.x += dirX * currentSpeed;
                this.mesh.position.z += dirZ * currentSpeed;
            }
        } else
        {
            this.isRunning = false;
        }

        if (this.gameCore && this.gameCore.mouseWorldPosition && !this.isDead)
        {
            this.lookAtMouse(this.gameCore.mouseWorldPosition);
        }

        // ⚔️ 通常攻撃・スキルモーションの更新
        if (this.isAttacking || this.isUsingSkill)
        {
            const duration = this.isUsingSkill ? this.skillDuration : this.attackDuration;
            this.attackProgress += 16.6 / duration;

            if (this.attackProgress >= 1.0)
            {
                this.isAttacking = false;
                this.isUsingSkill = false;
                this.attackProgress = 0;
                this.resetWeaponPose();
            }
            else
            {
                const p = this.attackProgress;

                // ─── 通常攻撃モーション ───
                if (this.isAttacking)
                {
                    if (this.weaponType === 'sword')
                    {
                        // 右から左へ一閃（正面が0度なので、右45度〜60度から、左-45度〜-60度へ振る）
                        const startRotY = THREE.MathUtils.degToRad(-60);
                        const endRotY = THREE.MathUtils.degToRad(60);
                        const currentRotY = startRotY + (endRotY - startRotY) * Math.sin(p * Math.PI / 2);

                        this.weaponMesh.position.set(0.3, 0.2, -0.2); // 右手位置に完全固定
                        // Y軸のみ滑らかに旋回させ、プレイヤー正面を綺麗に薙ぎ払わせる
                        this.weaponMesh.rotation.set(0, currentRotY, 0);
                    }
                    else if (this.weaponType === 'axe')
                    {
                        // 🪓 斧通常：プレイヤーの正面（縦軸）を上から下へ豪快に縦に振り下ろす！
                        // 進行度(p)の最初で少し上に振りかぶり、後半で一気に下（前方）へ叩きつける
                        const startRotX = THREE.MathUtils.degToRad(-60);  // 上に構えた状態
                        const endRotX = THREE.MathUtils.degToRad(80);    // 地面近くまで振り下ろした状態
                        const currentRotX = startRotX + (endRotX - startRotX) * Math.pow(p, 2); // 落下が加速するイージング

                        this.weaponMesh.position.set(0.3, 0.3, -0.2); // 右手位置に固定
                        this.weaponMesh.rotation.set(currentRotX, 0, 0); // X軸回転（縦振り）のみ
                    }
                    else if (this.weaponType === 'magic')
                    {
                        // 魔法通常
                        this.weaponMesh.position.set(0.4, 0.2, (p < 0.3) ? (-0.2 - (p / 0.3) * 0.5) : (-0.7 + ((p - 0.3) / 0.7) * 0.5));
                        this.weaponMesh.rotation.set(0, 0, 0);
                    }
                }
                // ─── スキル攻撃モーション ───
                else if (this.isUsingSkill)
                {
                    if (this.weaponType === 'sword')
                    {
                        // スキル：プレイヤーを中心に大回転（Z軸が正面なので、そのままY軸を360度×2回高速スピン）
                        const currentRotY = (Math.PI * 4) * p;
                        this.weaponMesh.position.set(0, 0.2, 0); // 中心にセットして
                        this.weaponMesh.rotation.set(0, currentRotY, 0); // 大回転
                    }
                    else if (this.weaponType === 'axe')
                    {
                        // 🪓 斧スキル：『激震・地裂叩きつけモーション』
                        // 前半40%で頭上を越えて背中側まで大きく「大タメ」を作り、後半60%で超高速で地面に叩きつける！
                        if (p < 0.4)
                        {
                            const subP = p / 0.4;
                            // 後ろに大きくのけぞる (-60度から-110度へためる)
                            const currentRotX = THREE.MathUtils.degToRad(-60 - 50 * subP);
                            this.weaponMesh.position.set(0.2, 0.4 + subP * 0.2, -0.1);
                            this.weaponMesh.rotation.set(currentRotX, 0, 0);
                        }
                        else
                        {
                            const subP = (p - 0.4) / 0.6;
                            // -110度から、一気に前方の地面（95度）まで超高速スマッシュ！
                            const currentRotX = THREE.MathUtils.degToRad(-110 + 205 * Math.sin(subP * Math.PI / 2));
                            this.weaponMesh.position.set(0.2, 0.6 - subP * 0.5, -0.1 - subP * 0.3);
                            this.weaponMesh.rotation.set(currentRotX, 0, 0);
                        }
                    }
                    else if (this.weaponType === 'magic')
                    {
                        this.weaponMesh.position.set(0, 0.2, 0);
                        this.weaponMesh.rotation.set(0, 0, 0);
                    }
                }
            }
        }

        // --- HTML UI更新 ---
        const hpPercent = (this.hp / this.maxHp) * 100;
        const hpBarElement = document.getElementById('hp-bar');
        const hpTextElement = document.getElementById('hp-text');
        if (hpBarElement && hpTextElement)
        {
            hpBarElement.style.width = `${hpPercent}%`;
            hpTextElement.innerText = `${Math.max(0, Math.round(this.hp))}/${this.maxHp}`;
            if (hpPercent > 50) hpBarElement.style.backgroundColor = '#00ff00';
            else if (hpPercent > 20) hpBarElement.style.backgroundColor = '#ffff00';
            else hpBarElement.style.backgroundColor = '#ff0000';
        }

        const staminaBarElement = document.getElementById('stamina-bar');
        const staminaTextElement = document.getElementById('stamina-text');
        if (staminaBarElement && staminaTextElement)
        {
            const stPercent = (this.stamina / this.maxStamina) * 100;
            staminaBarElement.style.width = `${stPercent}%`;
            staminaTextElement.innerText = `${Math.max(0, Math.round(this.stamina))}/${this.maxStamina}`;
        }

        const skillBarElement = document.getElementById('skill-bar');
        const skillTextElement = document.getElementById('skill-text');
        if (skillBarElement && skillTextElement)
        {
            skillBarElement.style.width = `${Math.min(100, this.skillGauge)}%`;
            skillTextElement.innerText = `${Math.min(100, Math.floor(this.skillGauge))}%`;
        }

        const hudElement = document.getElementById('hud');
        if (hudElement && this.hpShakeTime > 0)
        {
            const offsetX = (Math.random() - 0.5) * 12;
            const offsetY = (Math.random() - 0.5) * 12;
            hudElement.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
            this.hpShakeTime -= 16.6;
        } else if (hudElement)
        {
            hudElement.style.transform = 'translate(0px, 0px)';
        }
    }

    attack(enemies, createParticle)
    {
        // 🛡️ 割り込み防止：回避（ローリング）中は通常攻撃を出せないようにする
        if (this.isEvading)
        {
            return;
        }

        const now = Date.now();
        if (now - this.lastAttackTime < this.config.attackCooldown || this.isUsingSkill) return;
        this.lastAttackTime = now;

        if (this.gameCore && this.gameCore.mouseWorldPosition) this.lookAtMouse(this.gameCore.mouseWorldPosition);

        this.isAttacking = true;
        this.isUsingSkill = false;
        this.attackProgress = 0;

        if (this.weaponType === 'magic')
        {
            const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
            if (this.gameCore) this.gameCore.spawnBullet(this.mesh.position, direction, 0.35, this.config.attackDamage, true, 0xaa00ff);
        }
        else
        {
            const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion).normalize();
            forwardDir.y = 0;

            const attackAngleDeg = this.weaponType === 'sword' ? 120 : 160;
            const angleBoundary = Math.cos(THREE.MathUtils.degToRad(attackAngleDeg / 2));

            enemies.forEach(enemy =>
            {
                const toEnemyDir = new THREE.Vector3().subVectors(enemy.mesh.position, this.mesh.position);
                toEnemyDir.y = 0;
                const dist = toEnemyDir.length();

                if (dist <= this.config.attackRange)
                {
                    if (dist < 0.01)
                    {
                        enemy.takeDamage(this.config.attackDamage, this.mesh.position);
                        this.gainSkill(15);
                        return;
                    }
                    toEnemyDir.normalize();
                    const dotProduct = forwardDir.dot(toEnemyDir);
                    if (dotProduct >= angleBoundary)
                    {
                        enemy.takeDamage(this.config.attackDamage, this.mesh.position);
                        this.gainSkill(15);
                    }
                }
            });
        }
    }

    useSkill(enemies, onScreenShake, createParticle)
    {
        // 🛡️ 割り込み防止：回避（ローリング）中はスキルを発動できないようにする
        if (this.isEvading) return;

        this.skillGauge = 0;
        this.isUsingSkill = true;
        this.isAttacking = false;
        this.attackProgress = 0;

        if (this.weaponType === 'sword')
        {
            if (this.gameCore) this.gameCore.spawnVisualEffect('sword-skill', this.mesh.position, 4.0);
            createParticle(this.mesh.position, 0x00aaff, 30);
            enemies.forEach(enemy =>
            {
                if (this.mesh.position.distanceTo(enemy.mesh.position) <= 4.0) enemy.takeDamage(50, this.mesh.position);
            });
        }
        else if (this.weaponType === 'axe')
        {
            if (this.gameCore) this.gameCore.spawnVisualEffect('axe-skill', this.mesh.position, 6.0);
            createParticle(this.mesh.position, 0xff5500, 40);
            onScreenShake();
            enemies.forEach(enemy =>
            {
                if (this.mesh.position.distanceTo(enemy.mesh.position) <= 6.0) enemy.takeDamage(80, this.mesh.position);
            });
        }
        else if (this.weaponType === 'magic')
        {
            // 🔮 魔法スキル：プレイヤーの向いている正面へ、超巨大・高威力の貫通魔力弾を発射！
            const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion).normalize();

            if (this.gameCore)
            {
                // GameCoreが size と isSkill を受け取れるようになったので、引数を正しく並べて発射！
                this.gameCore.spawnBullet(
                    this.mesh.position,
                    direction,
                    0.25,                         // 巨大弾なので重々しく
                    this.config.attackDamage * 5, // 威力4倍
                    true,                         // プレイヤーの弾
                    0x00ffff,                     // 水色
                    1.8,                          // 🟢 サイズ（通常0.4の4.5倍の巨玉に！）
                    true                          // 🟢 isSkillをtrueにして大爆発・凍結・画面揺れを発動！
                );

                // スキル発動時の手元の魔力収束パーティクル
                createParticle(this.mesh.position, 0x00ffff, 40);
            }
        }
    }

    gainSkill(amount)
    {
        this.skillGauge = Math.min(this.config.skillThreshold, this.skillGauge + amount);
    }

    /**
     * 敵の通常攻撃や弾に当たってダメージを処理するメソッド
     * @param {number} amount - 受けるダメージ量
     * @param {THREE.Vector3} attackerPosition - 攻撃してきた敵の座標
     * @param {boolean} isBoss - ボスからの攻撃、またはボスのスキル弾ならtrue
     */
    takeDamage(amount, attackerPosition, isBoss = false)
    {
        // 【重要】無敵時間中、または死亡時はダメージ処理自体を完全にスルーする
        if (this.isDead || this.isInvincible) return;

        // 被弾した瞬間に無敵フラグを立てて、連続ヒットを防ぐ
        this.isInvincible = true;

        this.hp -= amount;
        this.gainSkill(10);

        // --- 1. ダメージポップアップの生成 ---
        if (this.gameCore && typeof this.gameCore.createPlayerDamagePopup === 'function')
        {
            // 第3引数の isBoss フラグをそのまま渡すことで、ボス戦での巨大文字表示に対応
            this.gameCore.createPlayerDamagePopup(amount, this.mesh.position, isBoss);
        }

        // --- 2. 被弾時のビジュアルエフェクト（一瞬赤く光る） ---
        if (this.mesh && this.mesh.material && this.mesh.material.color)
        {
            const origColor = this.mesh.material.color.getHex();
            this.mesh.material.color.setHex(0xff0000);

            setTimeout(() =>
            {
                if (!this.isDead && this.mesh && this.mesh.material)
                {
                    this.mesh.material.color.setHex(origColor);
                }
            }, 100);
        }

        // --- 3. ノックバックベクトルの計算 ---
        if (attackerPosition && this.mesh)
        {
            const dir = new THREE.Vector3().subVectors(this.mesh.position, attackerPosition);
            dir.y = 0;
            dir.normalize();
            this.knockbackVelocity.copy(dir.multiplyScalar(0.45));
        }

        // --- 4. HUD（UI）のシェイクタイマー起動 ---
        this.hpShakeTime = 300;

        // --- 5. 無敵時間の解除タイマー設定 ---
        // 200ミリ秒（0.2秒）だけ無敵状態を維持して、多段ヒットを防ぐ
        setTimeout(() =>
        {
            // ローリング中など、別の理由で無敵になっている場合は上書きしないように死亡判定だけチェック
            if (!this.isDead)
            {
                this.isInvincible = false;
            }
        }, 200);

        // --- 6. 死亡判定と死亡演出 ---
        if (this.hp <= 0) 
        {
            this.hp = 0;
            this.isDead = true;

            if (this.mesh)
            {
                this.mesh.rotation.z = Math.PI / 2;
                if (this.mesh.material) this.mesh.material.color.setHex(0x555555);
            }

            if (this.gameCore && typeof this.gameCore.gameOver === 'function')
            {
                this.gameCore.gameOver();
            }
        }
    }

    destroy()
    {
        this.scene.remove(this.mesh);
    }
}