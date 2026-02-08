let scene, camera, renderer, world;
let board, stones = [];
let hoverStone = null;
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

const BOARD_SIZE = 8;
const STONE_RADIUS = 0.4;
const STONE_HEIGHT = 0.2;
const MAX_CHARGE_TIME = 2000;
const CHARGE_FORCE_MULTIPLIER = 15;
const HOVER_HEIGHT = 0.5;

window.initGame = function(matchData, socket, playerColor) {
    console.log('Game initializing...', playerColor);
    
    mySocket = socket;
    myColor = playerColor;
    currentGameState = matchData.gameState;
    gameActive = true;
    gameStartTime = currentGameState.startTime;
    turnStartTime = currentGameState.turnStartTime;

    try {
        initThreeJS();
        initCannon();
        createBoard();
        createInitialStones();
        updateUI();
        setupEventListeners();
        animate();
        setInterval(updateTimers, 100);
        setupSocketListeners();
        
        console.log('Game started!');
    } catch (error) {
        console.error('Init error:', error);
    }
};

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 3);
    camera.lookAt(0, 0, 0);

    const canvas = document.getElementById('gameCanvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

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

    for (let i = 0; i <= BOARD_SIZE; i++) {
        const material = new THREE.LineBasicMaterial({ color: 0x1e8449 });
        
        const hPoints = [];
        hPoints.push(new THREE.Vector3(-BOARD_SIZE/2, 0.1, -BOARD_SIZE/2 + i));
        hPoints.push(new THREE.Vector3(BOARD_SIZE/2, 0.1, -BOARD_SIZE/2 + i));
        const hGeometry = new THREE.BufferGeometry().setFromPoints(hPoints);
        scene.add(new THREE.Line(hGeometry, material));

        const vPoints = [];
        vPoints.push(new THREE.Vector3(-BOARD_SIZE/2 + i, 0.1, -BOARD_SIZE/2));
        vPoints.push(new THREE.Vector3(-BOARD_SIZE/2 + i, 0.1, BOARD_SIZE/2));
        const vGeometry = new THREE.BufferGeometry().setFromPoints(vPoints);
        scene.add(new THREE.Line(vGeometry, material));
    }

    const boardShape = new CANNON.Box(new CANNON.Vec3(BOARD_SIZE/2, 0.1, BOARD_SIZE/2));
    const boardBody = new CANNON.Body({ mass: 0 });
    boardBody.addShape(boardShape);
    boardBody.position.y = -0.1;
    world.addBody(boardBody);
}

function createInitialStones() {
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

    const shape = new CANNON.Cylinder(STONE_RADIUS, STONE_RADIUS, STONE_HEIGHT, 32);
    const body = new CANNON.Body({
        mass: withPhysics ? 1 : 0,
        shape: shape
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
        transparent: true,
        opacity: 0.7
    });
    hoverStone = new THREE.Mesh(geometry, material);
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
    const canvas = document.getElementById('gameCanvas');

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
            hoverStone.position.set(point.x, HOVER_HEIGHT, point.z);
        } else {
            removeHoverStone();
        }
    }

    function handleStart(clientX, clientY) {
        if (!isMyTurn() || !hoverStone) return;

        isCharging = true;
        chargeStartTime = Date.now();
        chargeLevel = 0;
        document.getElementById('chargeMeter').classList.add('active');
    }

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

    canvas.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', (e) => handleStart(e.clientX, e.clientY));
    canvas.addEventListener('mouseup', (e) => handleEnd(e.clientX, e.clientY));

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

    document.getElementById('surrenderBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to give up?')) {
            mySocket.emit('surrender', { matchId: currentGameState.matchId });
        }
    });
}

function placeStone(gridX, gridZ, charge) {
    const worldX = gridX - BOARD_SIZE/2 + 0.5;
    const worldZ = gridZ - BOARD_SIZE/2 + 0.5;
    
    const stone = createStone(gridX, gridZ, myColor, true);
    
    if (charge > 0.1) {
        const force = charge * CHARGE_FORCE_MULTIPLIER;
        
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
                
                if (charge > 0.5 && distance < 1.5) {
                    s.color = myColor;
                    s.mesh.material.color.setHex(myColor === 'white' ? 0xecf0f1 : 0x2c3e50);
                    mySocket.emit('colorChange', {
                        matchId: currentGameState.matchId,
                        stoneId: s.id,
                        newColor: myColor
                    });
                }
            }
        });
    }

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
            }
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

    mySocket.on('opponentPlaced', (data) => {
        const stone = createStone(data.stone.gridX, data.stone.gridZ, data.stone.color, true);
        stone.id = data.stone.id;
        updateUI();
    });

    mySocket.on('physicsSync', (data) => {
        const stone = stones.find(s => s.id === data.stoneId);
        if (stone) {
            stone.body.position.set(data.position.x, data.position.y, data.position.z);
            if (data.velocity) {
                stone.body.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
            }
        }
    });

    mySocket.on('colorChange', (data) => {
        const stone = stones.find(s => s.id === data.stoneId);
        if (stone) {
            stone.color = data.newColor;
            stone.mesh.material.color.setHex(data.newColor === 'white' ? 0xecf0f1 : 0x2c3e50);
        }
    });

    mySocket.on('gameOver', (data) => {
        gameActive = false;
        const won = data.winner === mySocket.id;
        setTimeout(() => {
            alert(won ? 'You won!' : 'You lost!');
            location.reload();
        }, 500);
    });

    mySocket.on('opponentDisconnected', () => {
        gameActive = false;
        alert('Opponent disconnected.');
        location.reload();
    });
}

function isMyTurn() {
    if (!currentGameState) return false;
    return currentGameState.currentTurn === mySocket.id;
}

function updateUI() {
    const turnStone = document.querySelector('.turn-stone');
    if (turnStone) {
        const isMyTurnNow = isMyTurn();
        turnStone.className = 'turn-stone ' + (isMyTurnNow ? myColor : (myColor === 'white' ? 'black' : ''));
    }

    let whiteCount = 0;
    let blackCount = 0;
    
    stones.forEach(stone => {
        if (stone.body.position.y > -1) {
            if (stone.color === 'white') whiteCount++;
            else blackCount++;
        }
    });

    const whiteScore = document.getElementById('whiteScore');
    const blackScore = document.getElementById('blackScore');
    if (whiteScore) whiteScore.textContent = whiteCount;
    if (blackScore) blackScore.textContent = blackCount;
}

function updateTimers() {
    if (!gameActive || !gameStartTime || !turnStartTime) return;

    const gameElapsed = Date.now() - gameStartTime;
    const gameRemaining = Math.max(0, 180000 - gameElapsed);
    const minutes = Math.floor(gameRemaining / 60000);
    const seconds = Math.floor((gameRemaining % 60000) / 1000);
    
    const timer = document.getElementById('gameTimer');
    if (timer) {
        timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

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
            winner: myScore > opponentScore ? mySocket.id : 'opponent'
        });
    }

    const turnElapsed = Date.now() - turnStartTime;
    const turnRemaining = Math.max(0, 10000 - turnElapsed);
    const turnPercent = (turnRemaining / 10000) * 100;
    
    const turnFill = document.getElementById('turnTimerFill');
    if (turnFill) {
        turnFill.style.width = turnPercent + '%';
    }

    if (turnRemaining === 0 && isMyTurn() && gameActive) {
        mySocket.emit('turnTimeout', { matchId: currentGameState.matchId });
    }

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

    world.step(1/60);

    stones.forEach(stone => {
        stone.mesh.position.copy(stone.body.position);
        stone.mesh.quaternion.copy(stone.body.quaternion);
    });

    if (gameActive && Date.now() - lastPhysicsUpdate > 100) {
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
                    velocity: {
                        x: stone.body.velocity.x,
                        y: stone.body.velocity.y,
                        z: stone.body.velocity.z
                    }
                });
            }
        });
        lastPhysicsUpdate = Date.now();
    }

    renderer.render(scene, camera);
}
```

---

## 6. `.gitignore`
```
node_modules/
.DS_Store
*.log
.env
