// グローバル変数
let scene, camera, renderer, world;
let board, stones = [];
let selectedStone = null;
let isLocked = false;
let isCharging = false;
let chargeLevel = 0;
let chargeStartTime = 0;
let raycaster, mouse;
let currentGameState = null;
let myColor = null;
let mySocket = null;
let gameActive = false;
let gameStartTime = null;
let turnStartTime = null;

// 定数
const BOARD_SIZE = 8;
const CELL_SIZE = 1;
const STONE_RADIUS = 0.4;
const STONE_HEIGHT = 0.2;
const MAX_CHARGE_TIME = 2000; // 2秒
const CHARGE_FORCE_MULTIPLIER = 10;

// ゲーム初期化
window.initGame = function(matchData, socket, playerColor) {
    mySocket = socket;
    myColor = playerColor;
    currentGameState = matchData.gameState;
    gameActive = true;
    gameStartTime = currentGameState.startTime;
    turnStartTime = currentGameState.turnStartTime;

    // ゲーム画面を表示
    document.getElementById('gameContainer').style.display = 'block';

    // マッチ情報を保存
    localStorage.setItem('currentMatch', JSON.stringify(matchData));

    // 3Dシーンの初期化
    initThreeJS();
    initCannon();
    createBoard();
    createInitialStones();

    // UIの初期化
    updateUI();

    // イベントリスナー
    setupEventListeners();

    // アニメーションループ
    animate();

    // タイマー更新
    setInterval(updateTimers, 100);

    // Socket.ioイベント
    setupSocketListeners();
};

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // カメラ
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 12, 8);
    camera.lookAt(0, 0, 0);

    // レンダラー
    const canvas = document.getElementById('gameCanvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Raycaster
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // リサイズ処理
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function initCannon() {
    world = new CANNON.World();
    world.gravity.set(0, -20, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;
}

function createBoard() {
    // 盤面
    const boardGeometry = new THREE.BoxGeometry(BOARD_SIZE, 0.2, BOARD_SIZE);
    const boardMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x27ae60,
        roughness: 0.7,
        metalness: 0.1
    });
    board = new THREE.Mesh(boardGeometry, boardMaterial);
    board.position.y = -0.1;
    board.receiveShadow = true;
    scene.add(board);

    // グリッド線
    for (let i = 0; i <= BOARD_SIZE; i++) {
        const material = new THREE.LineBasicMaterial({ color: 0x1e8449 });
        
        // 横線
        const hPoints = [];
        hPoints.push(new THREE.Vector3(-BOARD_SIZE/2, 0.1, -BOARD_SIZE/2 + i));
        hPoints.push(new THREE.Vector3(BOARD_SIZE/2, 0.1, -BOARD_SIZE/2 + i));
        const hGeometry = new THREE.BufferGeometry().setFromPoints(hPoints);
        const hLine = new THREE.Line(hGeometry, material);
        scene.add(hLine);

        // 縦線
        const vPoints = [];
        vPoints.push(new THREE.Vector3(-BOARD_SIZE/2 + i, 0.1, -BOARD_SIZE/2));
        vPoints.push(new THREE.Vector3(-BOARD_SIZE/2 + i, 0.1, BOARD_SIZE/2));
        const vGeometry = new THREE.BufferGeometry().setFromPoints(vPoints);
        const vLine = new THREE.Line(vGeometry, material);
        scene.add(vLine);
    }

    // 物理ボディ（床）
    const boardShape = new CANNON.Box(new CANNON.Vec3(BOARD_SIZE/2, 0.1, BOARD_SIZE/2));
    const boardBody = new CANNON.Body({ mass: 0 });
    boardBody.addShape(boardShape);
    boardBody.position.y = -0.1;
    world.addBody(boardBody);
}

function createInitialStones() {
    // 初期配置の石を作成
    const initialPositions = [
        { x: 3, z: 3, color: 'white' },
        { x: 4, z: 4, color: 'white' },
        { x: 3, z: 4, color: 'black' },
        { x: 4, z: 3, color: 'black' }
    ];

    initialPositions.forEach(pos => {
        createStone(pos.x, pos.z, pos.color, false);
    });
}

function createStone(gridX, gridZ, color, withPhysics = true) {
    const worldX = gridX - BOARD_SIZE/2 + 0.5;
    const worldZ = gridZ - BOARD_SIZE/2 + 0.5;

    // Three.js mesh
    const geometry = new THREE.CylinderGeometry(STONE_RADIUS, STONE_RADIUS, STONE_HEIGHT, 32);
    const material = new THREE.MeshStandardMaterial({
        color: color === 'white' ? 0xecf0f1 : 0x2c3e50,
        roughness: 0.3,
        metalness: 0.2
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(worldX, STONE_HEIGHT/2, worldZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Cannon.js body
    const shape = new CANNON.Cylinder(STONE_RADIUS, STONE_RADIUS, STONE_HEIGHT, 32);
    const body = new CANNON.Body({
        mass: withPhysics ? 1 : 0,
        shape: shape,
        material: new CANNON.Material()
    });
    body.position.set(worldX, STONE_HEIGHT/2, worldZ);
    
    if (!withPhysics) {
        body.type = CANNON.Body.STATIC;
    }
    
    world.addBody(body);

    const stone = {
        mesh,
        body,
        gridX,
        gridZ,
        color,
        id: Date.now() + Math.random()
    };

    stones.push(stone);
    return stone;
}

function setupEventListeners() {
    const canvas = document.getElementById('gameCanvas');

    // マウスダウン - チャージ開始
    canvas.addEventListener('mousedown', (e) => {
        if (!isMyTurn()) return;

        isCharging = true;
        chargeStartTime = Date.now();
        chargeLevel = 0;
        document.getElementById('chargeMeter').classList.add('active');
    });

    // マウスアップ - 石を配置
    canvas.addEventListener('mouseup', (e) => {
        if (!isMyTurn() || !isCharging) return;

        isCharging = false;
        document.getElementById('chargeMeter').classList.remove('active');

        // マウス位置からグリッド座標を計算
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(board);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            const gridX = Math.floor(point.x + BOARD_SIZE/2);
            const gridZ = Math.floor(point.z + BOARD_SIZE/2);

            if (gridX >= 0 && gridX < BOARD_SIZE && gridZ >= 0 && gridZ < BOARD_SIZE) {
                placeStone(gridX, gridZ, chargeLevel);
            }
        }

        chargeLevel = 0;
        document.getElementById('chargeFill').style.width = '0%';
    });

    // マウス移動 - プレビュー
    canvas.addEventListener('mousemove', (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // スペースキー - ロック切り替え
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && selectedStone) {
            e.preventDefault();
            isLocked = !isLocked;
            
            if (isLocked) {
                selectedStone.body.type = CANNON.Body.DYNAMIC;
                selectedStone.body.mass = 1;
                selectedStone.body.updateMassProperties();
            } else {
                selectedStone.body.type = CANNON.Body.STATIC;
            }
        }
    });

    // 降参ボタン
    document.getElementById('surrenderBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to give up?')) {
            mySocket.emit('surrender', { matchId: currentGameState.matchId });
        }
    });
}

function placeStone(gridX, gridZ, charge) {
    const stone = createStone(gridX, gridZ, myColor, true);
    
    // チャージに応じた力を適用
    if (charge > 0) {
        const force = charge * CHARGE_FORCE_MULTIPLIER;
        
        // 周囲の石に力を加える
        stones.forEach(s => {
            if (s === stone) return;
            
            const dx = s.body.position.x - stone.body.position.x;
            const dz = s.body.position.z - stone.body.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < 2) {
                const forceDir = new CANNON.Vec3(dx, 0.5, dz).unit();
                s.body.applyImpulse(
                    forceDir.scale(force * (2 - distance)),
                    s.body.position
                );
                
                // 吹っ飛ばされた石の色を変更
                if (charge > 0.7) {
                    s.color = myColor;
                    s.mesh.material.color.setHex(myColor === 'white' ? 0xecf0f1 : 0x2c3e50);
                }
            }
        });
    }

    // サーバーに通知
    mySocket.emit('placeStone', {
        matchId: currentGameState.matchId,
        stone: {
            gridX,
            gridZ,
            color: myColor,
            charge
        }
    });

    updateUI();
}

function setupSocketListeners() {
    mySocket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        turnStartTime = gameState.turnStartTime;
        updateUI();
    });

    mySocket.on('physicsUpdate', (data) => {
        const stone = stones.find(s => s.id === data.stoneId);
        if (stone) {
            stone.body.position.copy(data.position);
            stone.body.quaternion.copy(data.rotation);
        }
    });

    mySocket.on('gameOver', (data) => {
        gameActive = false;
        const won = data.winner === mySocket.id;
        alert(won ? 'You won!' : 'You lost!');
        localStorage.removeItem('currentMatch');
        location.reload();
    });
}

function isMyTurn() {
    if (!currentGameState) return false;
    return currentGameState.currentTurn === mySocket.id;
}

function updateUI() {
    // ターン表示
    const turnStone = document.querySelector('.turn-stone');
    const isMyTurnNow = isMyTurn();
    turnStone.className = 'turn-stone ' + (isMyTurnNow ? myColor : (myColor === 'white' ? 'black' : ''));

    // スコア計算
    let whiteCount = 0;
    let blackCount = 0;
    
    stones.forEach(stone => {
        // 盤面上にある石のみカウント
        if (Math.abs(stone.body.position.y - STONE_HEIGHT/2) < 1) {
            if (stone.color === 'white') whiteCount++;
            else blackCount++;
        }
    });

    document.getElementById('whiteScore').textContent = whiteCount;
    document.getElementById('blackScore').textContent = blackCount;
}

function updateTimers() {
    if (!gameActive || !gameStartTime || !turnStartTime) return;

    // ゲーム時間
    const gameElapsed = Date.now() - gameStartTime;
    const gameRemaining = Math.max(0, 180000 - gameElapsed);
    const minutes = Math.floor(gameRemaining / 60000);
    const seconds = Math.floor((gameRemaining % 60000) / 1000);
    document.getElementById('gameTimer').textContent = 
        `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // ゲーム終了チェック
    if (gameRemaining === 0) {
        gameActive = false;
        mySocket.emit('gameEnd', { matchId: currentGameState.matchId });
    }

    // ターン時間
    const turnElapsed = Date.now() - turnStartTime;
    const turnRemaining = Math.max(0, 10000 - turnElapsed);
    const turnPercent = (turnRemaining / 10000) * 100;
    document.getElementById('turnTimerFill').style.width = turnPercent + '%';

    // ターンタイムアウト
    if (turnRemaining === 0 && isMyTurn()) {
        mySocket.emit('turnTimeout', { matchId: currentGameState.matchId });
    }

    // チャージメーター
    if (isCharging) {
        const chargeTime = Date.now() - chargeStartTime;
        chargeLevel = Math.min(1, chargeTime / MAX_CHARGE_TIME);
        document.getElementById('chargeFill').style.width = (chargeLevel * 100) + '%';
    }
}

function animate() {
    requestAnimationFrame(animate);

    // 物理シミュレーション
    world.step(1/60);

    // メッシュを物理ボディに同期
    stones.forEach(stone => {
        stone.mesh.position.copy(stone.body.position);
        stone.mesh.quaternion.copy(stone.body.quaternion);
    });

    renderer.render(scene, camera);
}
