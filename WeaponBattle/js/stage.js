class Stage
{
    constructor(scene)
    {
        this.scene = scene;
        this.radius = 30;
        this.obstacles = [];

        this.createGround();
        this.spawnObstaclesRandomly();
    }

    createGround()
    {
        // 1. 床ベース（背景用）
        const geometry = new THREE.CylinderGeometry(this.radius, this.radius, 0.2, 64);
        const material = new THREE.MeshLambertMaterial({ color: 0x0f1115 });
        const ground = new THREE.Mesh(geometry, material);
        ground.position.y = -0.1;
        this.scene.add(ground);

        // 2. ✨【円形化グリッドへの修正箇所】
        // HTMLのCanvas機能を用いて、プログラム内で格子模様のテクスチャ（画像データ）を動的に作成します
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // 元のコードのグリッド色（0x553c9a：深めの紫）を線の色として割り当て
        ctx.strokeStyle = '#553c9a';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, 256, 256);
        ctx.beginPath();
        ctx.moveTo(128, 0); ctx.lineTo(128, 256);
        ctx.moveTo(0, 128); ctx.lineTo(256, 128);
        ctx.stroke();

        // 作成した模様をThree.jsのテクスチャに変換
        const gridTexture = new THREE.CanvasTexture(canvas);
        gridTexture.wrapS = THREE.RepeatWrapping;
        gridTexture.wrapT = THREE.RepeatWrapping;

        // マス目のリピート数（元のGridHelperのサイズ60・分割数30に合わせて30×30に設定）
        gridTexture.repeat.set(30, 30);

        // 四角いGridHelperの代わりに、ステージ半径に合わせた「円形の板」を生成
        const gridGeo = new THREE.CircleGeometry(this.radius, 64);
        const gridMat = new THREE.MeshBasicMaterial({
            map: gridTexture,
            transparent: true,
            opacity: 0.6,          // グリッド線の透け具合
            depthWrite: false      // 地面とのチラつき（Zファイティング）防止
        });
        const grid = new THREE.Mesh(gridGeo, gridMat);

        // 立てられている円を地面と水平に寝かせる
        grid.rotation.x = -Math.PI / 2;
        // 床のベース（Y=-0.1）や境界リングよりわずかに上に配置して重なりを防ぐ
        grid.position.y = 0.01;
        this.scene.add(grid);

        // 3. 外周の床の境界リング
        const ringGeo = new THREE.RingGeometry(this.radius - 0.1, this.radius + 0.1, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xe9d8fd, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.02;
        this.scene.add(ring);

        // ✨【新機能】うす紫に怪しく光る「外周の防壁（バリア壁）」
        const wallHeight = 2.0;
        const wallGeo = new THREE.CylinderGeometry(this.radius, this.radius, wallHeight, 64, 1, true);

        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x2b134d,
            emissive: 0xd6bcfa,
            emissiveIntensity: 1.5,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide
        });

        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.y = wallHeight / 2;
        this.scene.add(wall);
    }

    // 🎲 障害物のランダム自動生成（発光マテリアル版）
    spawnObstaclesRandomly()
    {
        const obstacleCount = Math.floor(Math.random() * 7) + 6;
        let attempts = 0;

        while (this.obstacles.length < obstacleCount && attempts < 50)
        {
            attempts++;

            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * (this.radius * 0.85);
            const x = Math.cos(angle) * distance;
            const pz = Math.sin(angle) * distance;

            if (distance < 6.0) continue; // セーフゾーン

            const isBox = Math.random() > 0.5;
            let geometry, mesh, collisionRadius;
            const height = Math.random() * 3.0 + 2.0;

            // ✨【発光マテリアルの魔術】
            // MeshStandardMaterial を使い、emissive（自己発光色）に「うす紫」を設定します。
            // emissiveIntensity（発光強度）を上げることで、ライトの影に影響されず怪しく光ります。
            const glowMaterial = new THREE.MeshStandardMaterial({
                color: 0x1a0b2e,              // ベースの本来の色（暗い紫）
                emissive: 0xb794f4,           // ★自己発光する色（鮮やかなうす紫）
                emissiveIntensity: 1.2,       // ★発光の強さ（1.0以上で強めになります）
                roughness: 0.2,               // 少しツヤを持たせる
                metalness: 0.5                // 金属感を少し混ぜてサイバーに
            });

            if (isBox)
            {
                const sizeX = Math.random() * 2.0 + 1.5;
                const sizeZ = Math.random() * 2.0 + 1.5;
                geometry = new THREE.BoxGeometry(sizeX, height, sizeZ);
                mesh = new THREE.Mesh(geometry, glowMaterial); // 発光マテリアルを適用
                collisionRadius = Math.sqrt((sizeX / 2) * (sizeX / 2) + (sizeZ / 2) * (sizeZ / 2));
            } else
            {
                const rad = Math.random() * 1.5 + 1.0;
                geometry = new THREE.CylinderGeometry(rad, rad, height, 24);
                mesh = new THREE.Mesh(geometry, glowMaterial); // 発光マテリアルを適用
                collisionRadius = rad;
            }

            // 他の障害物との重複チェック
            let isTooClose = false;
            for (let i = 0; i < this.obstacles.length; i++)
            {
                const obs = this.obstacles[i];
                const dx = x - obs.position.x;
                const dz = pz - obs.position.z;
                const distToOther = Math.sqrt(dx * dx + dz * dz);
                if (distToOther < (collisionRadius + obs.radius + 2.0))
                {
                    isTooClose = true;
                    break;
                }
            }

            if (isTooClose) continue;

            mesh.position.set(x, height / 2, pz);
            this.scene.add(mesh);

            this.obstacles.push({
                position: new THREE.Vector3(x, 0, pz),
                radius: collisionRadius,
                mesh: mesh
            });
        }
    }

    // 衝突判定ロジックは変更なし（省略可能ですが一応そのまま保持）
    checkCollision(characterMesh, characterRadius = 0.5)
    {
        if (!characterMesh) return;
        const pos = characterMesh.position;
        const distFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        const maxAllowedDist = this.radius - characterRadius;
        if (distFromCenter > maxAllowedDist)
        {
            pos.x = (pos.x / distFromCenter) * maxAllowedDist;
            pos.z = (pos.z / distFromCenter) * maxAllowedDist;
        }
        this.obstacles.forEach(obs =>
        {
            const dx = pos.x - obs.position.x;
            const dz = pos.z - obs.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const minDist = obs.radius + characterRadius;
            if (distance < minDist)
            {
                const overlap = minDist - distance;
                const dirX = distance > 0 ? dx / distance : 1;
                const dirZ = distance > 0 ? dz / distance : 0;
                pos.x += dirX * overlap;
                pos.z += dirZ * overlap;
            }
        });
    }

    // ✨【新機能】GameCore側の clearScene から呼び出して安全に全削除するためのメソッド
    destroy()
    {
        this.obstacles.forEach(obs =>
        {
            this.scene.remove(obs.mesh);
            if (obs.mesh.geometry) obs.mesh.geometry.dispose();
            if (obs.mesh.material) obs.mesh.material.dispose();
        });
        this.obstacles = [];
    }
}