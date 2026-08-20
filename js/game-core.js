/**
 * ゲーム全体のメインシステムを管理するコアクラス
 * 3D空間のセットアップ、プレイヤーや敵の更新、当たり判定、ループ処理、SAO風UIデザインを一括で行います
 */
class GameCore {
    constructor() {
        // HTML上の描画用キャンバスを取得
        this.canvas = document.getElementById('game-canvas');

        // ゲームの状態管理用フラグ
        this.isPaused = false;   // 一時停止中か
        this.isPlaying = false;  // ゲームプレイ中か

        // 統計データ
        this.score = 0;
        this.killCount = 0;
        this.startTime = 0;
        this.elapsedTime = 0; // 秒
        this.timerInterval = null;

        // 各種ゲームオブジェクトを管理する配列
        this.enemies = [];    // 出現中の敵（Enemyインスタンス）のリスト
        this.particles = [];  // 画面上のエフェクト粒子のリスト
        this.bullets = [];    // 画面上の弾丸（Bulletインスタンス）のリスト
        this.visualEffects = []; // 3Dメッシュによるスキル等のビジュアルエフェクトリスト

        // 画面揺れ（スクリーンシェイク）の残り時間（フレーム数）
        this.shakeTime = 0;

        // Wave管理用の変数
        this.currentWave = 1;         // 現在のWave数
        this.maxWave = 3;             // 最大Wave数（3でボス戦）
        this.waveState = 'spawning';  // 'spawning'(出現中), 'playing'(戦闘中), 'interval'(休憩中), 'cleared'(全面クリア)
        this.waveTimer = 0;           // インターバル用のタイマー
        this.waveEnemyCount = 0;      // このWaveで出現させる総敵数
        this.spawnedCount = 0;        // 既にスポーンした敵の数

        // 🌐 SAO風UIスタイル・画面全体のデザイン統合の注入
        this.injectSAOStyles();

        // Three.js の初期化処理を実行
        this.initThree();

        // ブラウザの画面サイズが変更されたら自動で描画サイズを調整するイベント
        window.addEventListener('resize', () => this.onResize());

        // マウス位置管理
        this.mouse = new THREE.Vector2();
        this.mouseWorldPosition = new THREE.Vector3();
        this.raycaster = new THREE.Raycaster();

        // マウスが動いたときに2D座標を常に更新するイベント
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        // SAO風UIモーダルの初期化
        this.initResultModals();
    }

    /**
     * SAO (ソードアート・オンライン) 風の近未来UIデザインをHTML全体とシステムに適用するスタイルシート注入
     */
    injectSAOStyles() {
        if (document.getElementById('sao-theme-styles')) return;

        // Google Fonts の読み込み (Rajdhani & Orbitron)
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap';
        document.head.appendChild(fontLink);

        const style = document.createElement('style');
        style.id = 'sao-theme-styles';
        style.innerHTML = `
            /* SAO UI グローバル設定 */
            body, button, input, select, textarea {
                font-family: 'Rajdhani', 'Segoe UI', sans-serif !important;
                letter-spacing: 1.2px;
                color: #e0f0ff;
            }

            /* 背景をSAO風のダークディープブルーに統合 */
            body {
                background-color: #060913 !important;
                overflow: hidden;
            }

            /* タイトル・メニュー・ダイアログ・各種画面パネルのSAO風統一枠 */
            div[id$="-screen"], div[class*="menu"], div[class*="modal"], div[class*="dialog"], div[class*="panel"], div[style*="border"] {
                background: linear-gradient(135deg, rgba(14, 20, 34, 0.92) 0%, rgba(6, 10, 18, 0.96) 100%) !important;
                border: 1px solid rgba(0, 240, 255, 0.4) !important;
                box-shadow: 0 0 25px rgba(0, 240, 255, 0.15), inset 0 0 15px rgba(0, 240, 255, 0.05) !important;
                backdrop-filter: blur(10px);
                border-radius: 6px !important;
            }

            /* 見出しテキストのSAO風ネオン発光 */
            h1, h2, h3, .sao-title {
                font-family: 'Orbitron', sans-serif !important;
                font-weight: 900 !important;
                color: #00f0ff !important;
                text-shadow: 0 0 10px rgba(0, 240, 255, 0.6), 0 0 20px rgba(0, 240, 255, 0.3) !important;
                text-transform: uppercase !important;
                letter-spacing: 3px !important;
            }

            /* SAO ボタン共通スタイル（すべてのボタンを近未来デザインに変換） */
            button, .sao-btn {
                background: linear-gradient(135deg, rgba(20, 30, 50, 0.9) 0%, rgba(10, 15, 25, 0.95) 100%) !important;
                color: #ffffff !important;
                border: 1px solid #00f0ff !important;
                border-left: 4px solid #00f0ff !important;
                padding: 12px 28px !important;
                font-size: 16px !important;
                font-weight: 700 !important;
                font-family: 'Rajdhani', 'Orbitron', sans-serif !important;
                text-transform: uppercase !important;
                cursor: pointer !important;
                position: relative !important;
                transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
                box-shadow: 0 0 10px rgba(0, 240, 255, 0.2), inset 0 0 15px rgba(0, 240, 255, 0.1) !important;
                clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px)) !important;
                margin: 8px 0 !important;
            }

            button:hover, .sao-btn:hover {
                background: linear-gradient(135deg, rgba(0, 240, 255, 0.85) 0%, rgba(0, 120, 255, 0.95) 100%) !important;
                color: #000000 !important;
                border-color: #ffffff !important;
                box-shadow: 0 0 25px rgba(0, 240, 255, 0.8), 0 0 40px rgba(0, 240, 255, 0.5) !important;
                transform: scale(1.03) translateY(-2px) !important;
            }

            button:active, .sao-btn:active {
                transform: scale(0.98) translateY(0) !important;
            }

            /* HUD (スコア/キル/タイマー) のSAO風装飾 */
            #score-text, #kill-text, #timer-text, #wave-hud {
                font-family: 'Orbitron', sans-serif !important;
                font-weight: 700 !important;
                color: #00f0ff !important;
                text-shadow: 0 0 8px rgba(0, 240, 255, 0.6) !important;
            }

            /* SAO システムアナウンス */
            #wave-announce {
                font-family: 'Orbitron', sans-serif !important;
                font-weight: 900 !important;
                letter-spacing: 3px !important;
                text-shadow: 0 0 15px rgba(0, 240, 255, 0.8), 0 0 30px rgba(0, 120, 255, 0.5) !important;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Three.jsの基本コンポーネント構築
     */
    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x060913);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 15, 12);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(10, 20, 10);
        this.scene.add(dirLight);

        const reticleGeo = new THREE.TorusGeometry(0.6, 0.04, 8, 32);
        this.reticleMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.8
        });
        this.reticle = new THREE.Mesh(reticleGeo, this.reticleMat);

        this.reticle.rotation.x = Math.PI / 2;
        this.reticle.visible = false;
        this.scene.add(this.reticle);
    }

    start(weaponType) {
        this.clearScene();

        const resultModal = document.getElementById('result-modal-container');
        if (resultModal) {
            const clearM = document.getElementById('clear-modal');
            const overM = document.getElementById('over-modal');
            if (clearM) clearM.style.display = 'none';
            if (overM) overM.style.display = 'none';
        }

        this.isPlaying = true;
        this.isPaused = false;

        this.currentWave = 1;
        this.waveState = 'spawning';
        this.spawnedCount = 0;

        this.score = 0;
        this.killCount = 0;
        this.startTime = Date.now();
        this.elapsedTime = 0;
        this.updateHUD();

        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (this.isPlaying && !this.isPaused) {
                this.elapsedTime = Math.floor((Date.now() - this.startTime) / 1000);
                this.updateTimerHUD();
            }
        }, 1000);

        this.waveEnemyCount = 8;

        const waveHud = document.getElementById('wave-hud');
        if (waveHud) waveHud.classList.add('active');

        if (typeof Stage !== 'undefined') {
            this.stage = new Stage(this.scene);
        }

        this.player = new Player(this.scene, weaponType);

        if (weaponType === 'magic') {
            this.reticle.visible = true;
            this.reticleMat.color.setHex(0x00f0ff);
        } else {
            this.reticle.visible = false;
        }

        this.player.gameCore = this;
        this.startNextWave();
    }

    spawnEnemy(isBoss = false) {
        if (!isBoss && this.enemies.length >= 10) return;

        let type = 'melee';
        if (isBoss) {
            type = 'boss';
        } else {
            const types = ['melee', 'range'];
            type = types[Math.floor(Math.random() * types.length)];
        }

        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.random() * 5;
        const px = this.player.mesh.position.x + Math.cos(angle) * radius;
        const pz = this.player.mesh.position.z + Math.sin(angle) * radius;

        const enemy = new Enemy(this.scene, this.player, type, new THREE.Vector3(px, 0, pz));
        enemy.gameCore = this;
        this.enemies.push(enemy);
        this.spawnedCount++;
    }

    spawnBullet(position, direction, speed, damage, isPlayerBullet, color, size, isSkill) {
        const bullet = new Bullet(this.scene, position, direction, speed, damage, isPlayerBullet, color, size, isSkill);
        this.bullets.push(bullet);
        return bullet;
    }

    createParticleEffect(position, color, count) {
        for (let i = 0; i < count; i++) {
            const pGeom = new THREE.SphereGeometry(0.1, 4, 4);
            const pMat = new THREE.MeshBasicMaterial({ color: color });
            const pMesh = new THREE.Mesh(pGeom, pMat);
            pMesh.position.copy(position);

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                Math.random() * 0.3,
                (Math.random() - 0.5) * 0.3
            );

            this.scene.add(pMesh);
            this.particles.push({ mesh: pMesh, vel: velocity, life: 30 });
        }
    }

    spawnVisualEffect(type, position, radius) {
        let geom, mat, mesh;

        if (type === 'sword-skill') {
            geom = new THREE.TorusGeometry(0.1, 0.2, 8, 32);
            mat = new THREE.MeshBasicMaterial({
                color: 0x00f0ff,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            mesh = new THREE.Mesh(geom, mat);
            mesh.rotation.x = Math.PI / 2;
            mesh.position.copy(position);
            mesh.position.y = 0.5;
        }
        else if (type === 'axe-skill') {
            geom = new THREE.RingGeometry(0.01, 0.2, 32);
            mat = new THREE.MeshBasicMaterial({
                color: '#00f0ff',
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide
            });
            mesh = new THREE.Mesh(geom, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.copy(position);
            mesh.position.y = 0.05;
        }

        if (mesh) {
            this.scene.add(mesh);
            this.visualEffects.push({
                type: type, mesh: mesh, maxRadius: radius,
                currentProgress: 0, life: 15, maxLife: 15
            });
        }
    }

    triggerScreenShake() {
        this.shakeTime = 20;
    }

    update() {
        if (!this.isPlaying || this.isPaused) return;

        this.checkWaveProgress();

        if (this.camera && this.player) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            this.raycaster.ray.intersectPlane(groundPlane, this.mouseWorldPosition);

            if (this.reticle && this.reticle.visible) {
                this.reticle.position.copy(this.mouseWorldPosition);
                this.reticle.position.y = 0.02;
            }
        }

        this.player.update(
            this.enemies,
            () => this.triggerScreenShake(),
            (pos, col, cnt) => this.createParticleEffect(pos, col, cnt)
        );

        if (this.stage) {
            this.stage.checkCollision(this.player.mesh, 0.5);
        }

        if (this.player.isDead) {
            this.gameOver();
            return;
        }

        let camX = this.player.mesh.position.x;
        let camZ = this.player.mesh.position.z + 12;

        if (this.shakeTime > 0) {
            camX += (Math.random() - 0.5) * 0.3;
            camZ += (Math.random() - 0.5) * 0.3;
            this.shakeTime--;
        }
        this.camera.position.set(camX, 15, camZ);
        this.camera.lookAt(this.player.mesh.position);

        for (let i = this.visualEffects.length - 1; i >= 0; i--) {
            const fx = this.visualEffects[i];
            fx.life--;
            fx.currentProgress = 1.0 - (fx.life / fx.maxLife);

            const scale = fx.currentProgress * fx.maxRadius * 5;
            fx.mesh.scale.set(scale, scale, scale);

            if (fx.type === 'sword-skill') {
                fx.mesh.rotation.z += 0.4;
            }

            fx.mesh.material.opacity = (1.0 - fx.currentProgress) * 0.8;

            if (fx.life <= 0) {
                this.scene.remove(fx.mesh);
                fx.mesh.geometry.dispose();
                fx.mesh.material.dispose();
                this.visualEffects.splice(i, 1);
            }
        }

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update();

            if (bullet.isDead) {
                this.bullets.splice(i, 1);
                continue;
            }

            let bulletHitObstacle = false;
            if (this.stage) {
                const bPos = bullet.mesh.position;
                const distFromCenter = Math.sqrt(bPos.x * bPos.x + bPos.z * bPos.z);
                if (distFromCenter > this.stage.radius) bulletHitObstacle = true;

                this.stage.obstacles.forEach(obs => {
                    const dx = bPos.x - obs.position.x;
                    const dz = bPos.z - obs.position.z;
                    if (Math.sqrt(dx * dx + dz * dz) < obs.radius + 0.2) bulletHitObstacle = true;
                });
            }

            if (bulletHitObstacle) {
                this.createParticleEffect(bullet.mesh.position, 0xaaaaaa, 6);
                bullet.destroy();
                this.bullets.splice(i, 1);
                continue;
            }

            if (bullet.isPlayerBullet) {
                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const enemy = this.enemies[j];
                    const dist = new THREE.Vector2(bullet.mesh.position.x, bullet.mesh.position.z)
                        .distanceTo(new THREE.Vector2(enemy.mesh.position.x, enemy.mesh.position.z));
                    
                    const hitRadius = bullet.isSkill ? 1.5 : 1.0;

                    if (dist < hitRadius) {
                        if (bullet.isSkill) {
                            bullet.explode(this.enemies, this);
                        } else {
                            enemy.takeDamage(bullet.damage, bullet.mesh.position);
                            this.player.gainSkill(15);
                            this.createParticleEffect(bullet.mesh.position, 0x00f0ff, 12);
                        }
                        bullet.destroy();
                        this.bullets.splice(i, 1);
                        break;
                    }
                }
            } else {
                const dist = new THREE.Vector2(bullet.mesh.position.x, bullet.mesh.position.z)
                    .distanceTo(new THREE.Vector2(this.player.mesh.position.x, this.player.mesh.position.z));

                if (dist < 1.0) {
                    this.player.takeDamage(bullet.damage, bullet.mesh.position, bullet.isSkill || false);
                    this.createParticleEffect(bullet.mesh.position, 0xff3355, 12);
                    bullet.destroy();
                    this.bullets.splice(i, 1);
                }
            }
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(this.camera);

            if (this.stage) {
                const enemyRadius = enemy.type === 'melee' ? 0.5 : 0.4;
                this.stage.checkCollision(enemy.mesh, enemyRadius);
            }

            if (enemy.hp <= 0) {
                this.createParticleEffect(enemy.mesh.position, 0x00f0ff, 18);
                enemy.destroy();
                this.enemies.splice(i, 1);
                
                this.score += (enemy.type === 'boss' ? 1000 : 100);
                this.killCount++;
                this.updateHUD();
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.mesh.position.add(p.vel);
            p.life--;

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    setPause(pause) {
        this.isPaused = pause;
    }

    startNextWave() {
        this.waveState = 'spawning';
        this.spawnedCount = 0;

        if (this.currentWave === 1) this.waveEnemyCount = 4;
        else if (this.currentWave === 2) this.waveEnemyCount = 7;
        else if (this.currentWave === 3) this.waveEnemyCount = 4;

        const waveHud = document.getElementById('wave-hud');
        if (waveHud) waveHud.innerText = `FLOOR / WAVE ${this.currentWave}`;

        const announce = document.getElementById('wave-announce');
        if (announce) {
            if (this.currentWave === this.maxWave) {
                announce.innerText = "⚠️ SYSTEM WARNING: BOSS ENCOUNTER ⚠️";
                announce.style.color = "#ff3355";
            } else {
                announce.innerText = `WAVE ${this.currentWave} START`;
                announce.style.color = "#00f0ff";
            }
            announce.style.display = "block";
            setTimeout(() => {
                if (this.waveState !== 'interval' && this.isPlaying) announce.style.display = "none";
            }, 2000);
        }

        if (this.currentWave < 3) {
            for (let i = 0; i < this.waveEnemyCount; i++) this.spawnEnemy();
            this.waveState = 'playing';
        } else {
            this.spawnEnemy(true);
            for (let i = 0; i < 3; i++) this.spawnEnemy(false);
            this.waveState = 'playing';
        }
    }

    checkWaveProgress() {
        if (this.waveState === 'playing' && this.enemies.length === 0) {
            if (this.spawnedCount < this.waveEnemyCount) {
                this.spawnEnemy();
                return;
            }

            if (this.currentWave < this.maxWave) {
                this.waveState = 'interval';
                this.waveTimer = 60 * 5; 
            } else {
                this.waveState = 'cleared';
                this.gameClear();
                return;
            }
        }

        if (this.waveState === 'interval') {
            this.waveTimer--;
            const announce = document.getElementById('wave-announce');
            if (announce) {
                const remainingSeconds = Math.ceil(this.waveTimer / 60);
                announce.innerText = `NEXT WAVE IN ${remainingSeconds}S`;
                announce.style.color = "#00f0ff";
                announce.style.display = "block";
            }
            if (this.waveTimer <= 0) {
                this.currentWave++;
                this.startNextWave();
            }
        }
    }

    clearScene() {
        clearInterval(this.spawnTimer);
        this.enemies.forEach(e => e.destroy());
        this.particles.forEach(p => this.scene.remove(p.mesh));
        this.bullets.forEach(b => b.destroy());
        this.visualEffects.forEach(fx => {
            this.scene.remove(fx.mesh);
            fx.mesh.geometry.dispose();
            fx.mesh.material.dispose();
        });

        if (this.stage) this.stage.destroy();

        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            const child = this.scene.children[i];
            if (child.userData.isObstacle || (child instanceof THREE.Mesh && child !== this.reticle && (!this.player || child !== this.player.mesh))) {
                this.scene.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            }
        }
        this.stage = null;
        this.enemies = []; this.particles = []; this.bullets = []; this.visualEffects = [];
        if (this.reticle) this.reticle.visible = false;
        if (this.player) { this.player.destroy(); this.player = null; }

        const waveHud = document.getElementById('wave-hud');
        const waveAnnounce = document.getElementById('wave-announce');
        if (waveHud) waveHud.classList.remove('active');
        if (waveAnnounce) waveAnnounce.style.display = 'none';
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    gameClear() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        if (this.timerInterval) clearInterval(this.timerInterval);

        const timeBonus = Math.max(0, 300 - this.elapsedTime) * 10;
        this.score += timeBonus;
        this.updateHUD();

        const oldResultScreen = document.getElementById('game-over-screen') || document.getElementById('result-screen');
        if (oldResultScreen) {
            oldResultScreen.style.display = 'none';
        }

        this.showClearModal(timeBonus);

        if (this.onGameOverCallback) {
            this.onGameOverCallback(this.score, true);
        }
    }

    gameOver() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        if (this.player) this.player.isDead = true;
        if (this.timerInterval) clearInterval(this.timerInterval);

        const oldResultScreen = document.getElementById('game-over-screen') || document.getElementById('result-screen');
        if (oldResultScreen) {
            oldResultScreen.style.display = 'none';
        }

        this.showGameOverModal();

        if (this.onGameOverCallback) {
            this.onGameOverCallback(this.score, false);
        }
    }

    createPlayerDamagePopup(amount, position, isBoss) {
        const popup = document.createElement('div');
        popup.innerText = Math.round(amount);
        popup.style.position = 'absolute';
        popup.style.color = '#ff3355';
        popup.style.fontWeight = 'bold';
        popup.style.fontFamily = "'Orbitron', sans-serif";
        popup.style.textShadow = '0 0 10px rgba(255, 51, 85, 0.8), 2px 2px 0px #000';
        popup.style.pointerEvents = 'none';
        popup.style.userSelect = 'none';
        popup.style.zIndex = '9999';

        const baseFontSize = isBoss ? 36 : 26;
        popup.style.fontSize = `${baseFontSize}px`;
        document.body.appendChild(popup);

        const startTime = Date.now();
        const duration = 800;
        const speedMultiplier = isBoss ? 6 : 4;
        const velX = (Math.random() - 0.5) * speedMultiplier;
        const velY = (isBoss ? 7 : 5) + Math.random() * 3;

        let offsetX = 0;
        let offsetY = 0;
        const initialPos = position.clone();
        initialPos.y += 1.2;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;

            if (progress >= 1.0 || !this.camera) {
                popup.remove();
                return;
            }

            const t = elapsed / 1000;
            offsetX += velX;
            offsetY += velY - (15 * t);

            const popupPos = initialPos.clone();
            popupPos.project(this.camera);

            if (popupPos.z > 1) {
                popup.style.display = 'none';
            } else {
                popup.style.display = 'block';
                const x = (popupPos.x * .5 + 0.5) * window.innerWidth;
                const y = (-(popupPos.y * 0.5) + 0.5) * window.innerHeight;

                popup.style.left = `${x + offsetX - (baseFontSize / 2)}px`;
                popup.style.top = `${y - offsetY}px`;

                if (progress > 0.5) popup.style.opacity = `${1.0 - (progress - 0.5) * 2}`;
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    updateHUD() {
        const scoreElem = document.getElementById('score-text');
        const killElem = document.getElementById('kill-text');
        if (scoreElem) scoreElem.innerText = `SCORE: ${this.score}`;
        if (killElem) killElem.innerText = `KILLS: ${this.killCount}`;
    }

    updateTimerHUD() {
        const timerElem = document.getElementById('timer-text');
        if (timerElem) {
            const minutes = String(Math.floor(this.elapsedTime / 60)).padStart(2, '0');
            const seconds = String(this.elapsedTime % 60).padStart(2, '0');
            timerElem.innerText = `TIME: ${minutes}:${seconds}`;
        }
    }

    initResultModals() {
        const existing = document.getElementById('result-modal-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'result-modal-container';
        container.innerHTML = `
            <style>
                .sao-modal-overlay {
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    background: rgba(6, 9, 19, 0.88); backdrop-filter: blur(8px);
                    display: flex; justify-content: center; align-items: center; z-index: 999999;
                    font-family: 'Rajdhani', sans-serif;
                }
                .sao-modal-box {
                    background: linear-gradient(180deg, rgba(16, 22, 36, 0.95) 0%, rgba(8, 12, 20, 0.98) 100%);
                    border: 1px solid rgba(0, 240, 255, 0.6);
                    border-radius: 4px; padding: 0; width: 420px;
                    box-shadow: 0 0 30px rgba(0, 240, 255, 0.3), inset 0 0 20px rgba(0, 240, 255, 0.1);
                    position: relative; overflow: hidden;
                }
                .sao-modal-box.clear-theme {
                    border-color: rgba(0, 240, 255, 0.8);
                    box-shadow: 0 0 35px rgba(0, 240, 255, 0.4), inset 0 0 20px rgba(0, 240, 255, 0.15);
                }
                .sao-modal-box.over-theme {
                    border-color: rgba(255, 51, 85, 0.8);
                    box-shadow: 0 0 35px rgba(255, 51, 85, 0.4), inset 0 0 20px rgba(255, 51, 85, 0.15);
                }
                .sao-header-bar {
                    height: 38px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between;
                    background: linear-gradient(90deg, #00f0ff 0%, #0077ff 100%);
                    color: #000000; font-family: 'Orbitron', sans-serif; font-weight: 900;
                    font-size: 14px; letter-spacing: 2px; text-transform: uppercase;
                }
                .sao-header-bar.over-theme {
                    background: linear-gradient(90deg, #ff3355 0%, #990022 100%);
                    color: #ffffff;
                }
                .sao-body { padding: 25px 30px; text-align: center; }
                .sao-main-title {
                    font-family: 'Orbitron', sans-serif; font-size: 26px; font-weight: 900;
                    margin-bottom: 20px; letter-spacing: 2px;
                }
                .sao-main-title.clear { color: #00f0ff; text-shadow: 0 0 12px rgba(0, 240, 255, 0.8); }
                .sao-main-title.over { color: #ff3355; text-shadow: 0 0 12px rgba(255, 51, 85, 0.8); }
                
                .sao-stat-list { margin: 20px 0; border-top: 1px solid rgba(255, 255, 255, 0.1); }
                .sao-stat-row {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    font-size: 18px; font-weight: 600; color: #d0d8e8;
                }
                .sao-stat-val { font-family: 'Orbitron', sans-serif; font-weight: 700; color: #ffffff; }
                .sao-bonus-val { color: #00f0ff; text-shadow: 0 0 8px rgba(0,240,255,0.6); }

                .sao-action-bar { margin-top: 25px; display: flex; justify-content: center; }
            </style>

            <div id="clear-modal" class="sao-modal-overlay" style="display: none;">
                <div class="sao-modal-box clear-theme">
                    <div class="sao-header-bar">
                        <span>SYSTEM ANNOUNCEMENT</span>
                        <span>[STAGE CLEARED]</span>
                    </div>
                    <div class="sao-body">
                        <div class="sao-main-title clear">CONGRATULATIONS!</div>
                        <div class="sao-stat-list">
                            <div class="sao-stat-row"><span>TOTAL SCORE</span><span id="clear-score" class="sao-stat-val">0</span></div>
                            <div class="sao-stat-row"><span>TARGETS KILLED</span><span id="clear-kills" class="sao-stat-val">0</span></div>
                            <div class="sao-stat-row"><span>CLEAR TIME</span><span id="clear-time" class="sao-stat-val">0s</span></div>
                            <div class="sao-stat-row"><span>TIME BONUS</span><span id="clear-bonus" class="sao-stat-val sao-bonus-val">+0</span></div>
                        </div>
                        <div class="sao-action-bar">
                            <button class="sao-btn" onclick="location.reload()">LINK START AGAIN</button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="over-modal" class="sao-modal-overlay" style="display: none;">
                <div class="sao-modal-box over-theme">
                    <div class="sao-header-bar over-theme">
                        <span>SYSTEM NOTIFICATION</span>
                        <span>[YOU DIED]</span>
                    </div>
                    <div class="sao-body">
                        <div class="sao-main-title over">YOU DIED</div>
                        <div class="sao-stat-list">
                            <div class="sao-stat-row"><span>FINAL SCORE</span><span id="over-score" class="sao-stat-val">0</span></div>
                            <div class="sao-stat-row"><span>TARGETS KILLED</span><span id="over-kills" class="sao-stat-val">0</span></div>
                            <div class="sao-stat-row"><span>SURVIVED TIME</span><span id="over-time" class="sao-stat-val">0s</span></div>
                        </div>
                        <div class="sao-action-bar">
                            <button class="sao-btn" onclick="location.reload()">RESPAWN / RETRY</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
    }

    showClearModal(timeBonus = 0) {
        const overModal = document.getElementById('over-modal');
        if (overModal) overModal.style.display = 'none';

        document.getElementById('clear-score').innerText = this.score;
        document.getElementById('clear-kills').innerText = this.killCount;
        document.getElementById('clear-time').innerText = `${this.elapsedTime}s`;
        document.getElementById('clear-bonus').innerText = `+${timeBonus}`;

        const clearModal = document.getElementById('clear-modal');
        if (clearModal) clearModal.style.display = 'flex';
    }

    showGameOverModal() {
        const clearModal = document.getElementById('clear-modal');
        if (clearModal) clearModal.style.display = 'none';

        document.getElementById('over-score').innerText = this.score;
        document.getElementById('over-kills').innerText = this.killCount;
        document.getElementById('over-time').innerText = `${this.elapsedTime}s`;

        const overModal = document.getElementById('over-modal');
        if (overModal) overModal.style.display = 'flex';
    }
}