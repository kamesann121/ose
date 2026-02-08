console.log('board.js loaded');

// グローバル変数
let scene, camera, renderer, world;
let board, stones = [];
let hoverStone = null;
let isPlacing = false;
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
const MAX_CHARGE_TIME = 2000;
const CHARGE_FORCE_MULTIPLIER = 15;
const HOVER_HEIGHT = 0.5;

// ゲーム初期化
window.initGame = function(matchData, socket, playerColor) {
    console.log('initGame called', matchData, playerColor);
    
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

    try {
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
        
        console.log('Game initialized successfully');
    } catch (error) {
        console.error('Error initializing game:', error);
    }
};

function initThreeJS() {
    console.log('Initializing Three.js');
    
    if (typeof THREE === 'undefined') {
        console.error('THREE is not loaded!');
        return;
    }
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // カメラ
    camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 10, 3);
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
    
    console.log('Three.js initialized');
}

function initCannon() {
    console.log('Initializing Cannon.js');
    
    if (typeof CANNON === 'undefined') {
        console.error('CANNON is not loaded!');
        return;
    }
    
    world = new CANNON.World();
    world.gravity.set(0, -20, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;
    
    console.log('Cannon.js initialized');
}

function createBoard() {
    console.log('Creating board');
    
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
    
    console.log('Board created');
}

function createInitialStones() {
    console.log('Creating initial stones');
    
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
    
    console.log('Initial stones created:', stones.length);
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

function createHoverStone() {
    if (hoverStone) return;
    
    const geometry = new THREE.CylinderGeometry(STONE_RADIUS, STONE_RADIUS, STONE_HEIGHT, 32);
    const material = new THREE.MeshStandardMaterial({
        color: myColor === 'white' ? 0xecf0f1 : 0x2c3e50,
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: 0.7
    });
    hoverStone = new THREE.Mesh(geometry, material);
    hoverStone.castShadow = true;
    scene.add(hoverStone);
}

function removeHoverStone() {
    if (hoverStone) {
        scene.remove(hoverStone);
        hoverStone.geometry.dispose();
        hoverStone.material.dispose();
        hoverStone = null;
    }
}

function setupEventListeners() {
    console.log('Setting up event listeners');
    
    const canvas = document.getElementById('gameCanvas');

    // マウス/タッチ移動 - 石を構える
    function handleMove(clientX, clientY) {
        if (!isMyTurn()) {
            removeHoverStone();
            return;
        }

        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(board);

        if (intersects.length > 0) {
            createHoverStone();
            const point = intersects[0].point;
            
            if (isPlacing) {
                hoverStone.position.set(point.x, STONE_HEIGHT/2, point.z);
            } else {
                hoverStone.position.set(point.x, HOVER_HEIGHT, point.z);
            }
        } else {
            removeHoverStone();
        }
    }

    // マウス/タッチ開始 - チャージ開始
    function handleStart(clientX, clientY) {
        if (!isMyTurn() || !hoverStone) return;

        isCharging = true;
        chargeStartTime = Date.now();
        chargeLevel = 0;
        document.getElementById('chargeMeter').classList.add('active');
    }

    // マウス/タッチ終了 - 石を配置
    function handleEnd(clientX, clientY) {
        if (!isMyTurn() || !isCharging || !hoverStone) return;

        isCharging = false;
        document.getElementById('chargeMeter').classList.remove('active');

        const gridX = Math.floor(hoverStone.position.x + BOARD_SIZE/2);
        const gridZ = Math.floor(hoverStone.position.z + BOARD_SIZE/2);

        if (gridX >= 0 && gridX < BOARD_SIZE && gridZ >= 0 && gridZ < BOARD_SIZE) {
            placeStone(gridX, gridZ, chargeLevel);
            removeHoverStone();
        }

        chargeLevel = 0;
        document.getElementById('chargeFill').style.width = '0%';
    }

    // マウスイベント
    canvas.addEventListener('mousemove', (e) => {
        handleMove(e.clientX, e.clientY);
    });

    canvas.addEventListener('mousedown', (e) => {
        handleStart(e.clientX, e.clientY);
    });

    canvas.addEventListener('mouseup', (e) => {
        handleEnd(e.clientX, e.clientY);
    });

    // タッチイベント（スマホ対応）
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
    }, { passive: false });

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
        handleStart(touch.clientX, touch.clientY);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            handleEnd(touch.clientX, touch.clientY);
        }
    }, { passive: false });

    // スペースキー - 密接モード切り替え
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && isMyTurn()) {
            e.preventDefault();
            isPlacing = !isPlacing;
        }
    });

    // 降参ボタン
    const surrenderBtn = document.getElementById('surrenderBtn');
    if (surrenderBtn) {
        surrenderBtn.addEventListener('click', () => {
            console.log('Surrender button clicked');
            if (confirm('Are you sure you want to give up?')) {
                console.log('Sending surrender event');
                mySocket.emit('surrender', { matchId: currentGameState.matchId });
            }
        });
    }
    
    console.log('Event listeners set up');
}

function placeStone(gridX, gridZ, charge) {
    console.log('Placing stone at', gridX, gridZ, 'with charge', charge);
    
    const worldX = gridX - BOARD_SIZE/2 + 0.5;
    const worldZ = gridZ - BOARD_SIZE/2 + 0.5;
    
    const stone = createStone(gridX, gridZ, myColor, true);
    
    // チャージに応じた力を適用
    if (charge > 0.1) {
        const force = charge * CHARGE_FORCE_MULTIPLIER;
        
        // 周囲の石に力を加える
        stones.forEach(s => {
            if (s === stone) return;
            
            const dx = s.body.position.x - worldX;
            const dz = s.body.position.z - worldZ;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < 2.5) {
                const forceDir = new CANNON.Vec3(dx, 1, dz);
                forceDir.normalize();
                const impulseMagnitude = force * (2.5 - distance) / 2.5;
                
                s.body.applyImpulse(
                    new CANNON.Vec3(
                        forceDir.x * impulseMagnitude,
                        forceDir.y * impulseMagnitude * 0.5,
                        forceDir.z * impulseMagnitude
                    ),
                    s.body.position
                );
                
                // 吹っ飛ばされた石の色を変更
                if (charge > 0.5 && distance < 1.5) {
                    s.color = myColor;
                    s.mesh.material.color.setHex(myColor === 'white' ? 0xecf0f1 : 0x2c3e50);
                    
                    // サーバーに色変更を通知
                    mySocket.emit('colorChange', {
                        matchId: currentGameState.matchId,
                        stoneId: s.id,
                        newColor: myColor
                    });
                }
            }
        });
    }

    // サーバーに石配置を通知
    mySocket.emit('placeStone', {
        matchId: currentGameState.matchId,
        stone: {
            id: stone.id,
            gridX,
            gridZ,
            color: myColor,
            charge,
            position: {
                x: stone.body.position.x,
                y: stone.body.position.y,
                z: stone.body.position.z
            },
            rotation: {
                x: stone.body.quaternion.x,
                y: stone.body.quaternion.y,
                z: stone.body.quaternion.z,
                w: stone.body.quaternion.w
            }
        }
    });

    updateUI();
}

function setupSocketListeners() {
    console.log('Setting up socket listeners');
    
    // ゲーム状態更新
    mySocket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        turnStartTime = gameState.turnStartTime;
        updateUI();
    });

    // 相手が石を配置
    mySocket.on('opponentPlaced', (data) => {
        console.log('Opponent placed stone', data);
        const stone = createStone(data.stone.gridX, data.stone.gridZ, data.stone.color, true);
        stone.id = data.stone.id;
        
        // 物理状態を同期
        stone.body.position.set(data.stone.position.x, data.stone.position.y, data.stone.position.z);
        if (data.stone.rotation) {
            stone.body.quaternion.set(
                data.stone.rotation.x,
                data.stone.rotation.y,
                data.stone.rotation.z,
                data.stone.rotation.w
            );
        }
        
        updateUI();
    });

    // 物理状態の同期
    mySocket.on('physicsSync', (data) => {
        const stone = stones.find(s => s.id === data.stoneId);
        if (stone) {
            stone.body.position.set(data.position.x, data.position.y, data.position.z);
            stone.body.quaternion.set(
                data.rotation.x,
                data.rotation.y,
                data.rotation.z,
                data.rotation.w
            );
            stone.body.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
            stone.body.angularVelocity.set(
                data.angularVelocity.x,
                data.angularVelocity.y,
                data.angularVelocity.z
            );
        }
    });

    // 石の色変更
    mySocket.on('colorChange', (data) => {
        const stone = stones.find(s => s.id === data.stoneId);
        if (stone) {
            stone.color = data.newColor;
            stone.mesh.material.color.setHex(data.newColor === 'white' ? 0xecf0f1 : 0x2c3e50);
        }
    });

    // 試合終了
    mySocket.on('gameOver', (data) => {
        console.log('Game over', data);
        gameActive = false;
        const won = data.winner === mySocket.id;
        
        setTimeout(() => {
            alert(won ? 'You won!' : (data.reason === 'surrender' ? 'Opponent gave up!' : 'You lost!'));
            
            // ロビーに戻る
            if (window.returnToLobby) {
                window.returnToLobby();
            } else {
                localStorage.removeItem('currentMatch');
                location.reload();
            }
        }, 500);
    });

    // 相手切断
    mySocket.on('opponentDisconnected', () => {
        console.log('Opponent disconnected');
        gameActive = false;
        
        setTimeout(() => {
            alert('Opponent disconnected.');
            
            // ロビーに戻る
            if (window.returnToLobby) {
                window.returnToLobby();
            } else {
                localStorage.removeItem('currentMatch');
                location.reload();
            }
        }, 500);
    });
}

function isMyTurn() {
    if (!currentGameState) return false;
    return currentGameState.currentTurn === mySocket.id;
}

function updateUI() {
    // ターン表示
    const turnStone = document.querySelector('.turn-stone');
    if (turnStone) {
        const isMyTurnNow = isMyTurn();
        turnStone.className = 'turn-stone ' + (isMyTurnNow ? myColor : (myColor === 'white' ? 'black' : ''));
    }

    // スコア計算
    let whiteCount = 0;
    let blackCount = 0;
    
    stones.forEach(stone => {
        if (stone.body.position.y > -1) {
            if (stone.color === 'white') whiteCount++;
            else blackCount++;
        }
    });

    const whiteScoreEl = document.getElementById('whiteScore');
    const blackScoreEl = document.getElementById('blackScore');
    
    if (whiteScoreEl) whiteScoreEl.textContent = whiteCount;
    if (blackScoreEl) blackScoreEl.textContent = blackCount;
}

function updateTimers() {
    if (!gameActive || !gameStartTime || !turnStartTime) return;

    // ゲーム時間
    const gameElapsed = Date.now() - gameStartTime;
    const gameRemaining = Math.max(0, 180000 - gameElapsed);
    const minutes = Math.floor(gameRemaining / 60000);
    const seconds = Math.floor((gameRemaining % 60000) / 1000);
    
    const timerEl = document.getElementById('gameTimer');
    if (timerEl) {
        timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // ゲーム終了チェック
    if (gameRemaining === 0 && gameActive) {
        gameActive = false;
        
        let whiteCount = 0;
        let blackCount = 0;
        stones.forEach(stone => {
            if (stone.body.position.y > -1) {
                if (stone.color === 'white') whiteCount++;
                else blackCount++;
            }
        });
        
        const myScore = myColor === 'white' ? whiteCount : blackCount;
        const opponentScore = myColor === 'white' ? blackCount : whiteCount;
        
        mySocket.emit('gameEnd', {
            matchId: currentGameState.matchId,
            winner: myScore > opponentScore ? mySocket.id : (myScore < opponentScore ? 'opponent' : 'draw'),
            scores: { white: whiteCount, black: blackCount }
        });
    }

    // ターン時間
    const turnElapsed = Date.now() - turnStartTime;
    const turnRemaining = Math.max(0, 10000 - turnElapsed);
    const turnPercent = (turnRemaining / 10000) * 100;
    
    const turnTimerFill = document.getElementById('turnTimerFill');
    if (turnTimerFill) {
        turnTimerFill.style.width = turnPercent + '%';
    }

    // ターンタイムアウト
    if (turnRemaining === 0 && isMyTurn() && gameActive) {
        mySocket.emit('turnTimeout', { matchId: currentGameState.matchId });
    }

    // チャージメーター
    if (isCharging) {
        const chargeTime = Date.now() - chargeStartTime;
        chargeLevel = Math.min(1, chargeTime / MAX_CHARGE_TIME);
        const chargeFill = document.getElementById('chargeFill');
        if (chargeFill) {
            chargeFill.style.width = (chargeLevel * 100) + '%';
        }
    }
}

let lastPhysicsUpdate = 0;
function animate() {
    requestAnimationFrame(animate);

    if (!world || !renderer || !scene || !camera) return;

    // 物理シミュレーション
    world.step(1/60);

    // メッシュを物理ボディに同期
    stones.forEach(stone => {
        stone.mesh.position.copy(stone.body.position);
        stone.mesh.quaternion.copy(stone.body.quaternion);
    });

    // 物理状態を定期的に送信
    if (gameActive && Date.now() - lastPhysicsUpdate > 1000/60) {
        stones.forEach(stone => {
            const velocity = stone.body.velocity.length();
            if (velocity > 0.1) {
                mySocket.emit('updatePhysics', {
                    matchId: currentGameState.matchId,
                    stoneId: stone.id,
                    position: {
                        x: stone.body.position.x,
                        y: stone.body.position.y,
                        z: stone.body.position.z
                    },
                    rotation: {
                        x: stone.body.quaternion.x,
                        y: stone.body.quaternion.y,
                        z: stone.body.quaternion.z,
                        w: stone.body.quaternion.w
                    },
                    velocity: {
                        x: stone.body.velocity.x,
                        y: stone.body.velocity.y,
                        z: stone.body.velocity.z
                    },
                    angularVelocity: {
                        x: stone.body.angularVelocity.x,
                        y: stone.body.angularVelocity.y,
                        z: stone.body.angularVelocity.z
                    }
                });
            }
        });
        lastPhysicsUpdate = Date.now();
    }

    renderer.render(scene, camera);
}

console.log('board.js fully loaded');
