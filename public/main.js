// Socket.io接続
const socket = io();

// DOM要素
const fakeSite = document.getElementById('fakeSite');
const lobby = document.getElementById('lobby');
const matchBtn = document.getElementById('matchBtn');
const statusDiv = document.getElementById('status');

// 現在の状態
let currentState = 'fake'; // 'fake', 'lobby', 'playing'
let currentMatch = null;
let playerColor = null;

// Ctrl+1でロビー表示
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '1') {
        e.preventDefault();
        if (currentState === 'fake') {
            showLobby();
        }
    }
});

function showLobby() {
    fakeSite.style.display = 'none';
    lobby.classList.add('active');
    currentState = 'lobby';
}

function hideLobby() {
    lobby.classList.remove('active');
    currentState = 'playing';
}

// マッチメイキングボタン
matchBtn.addEventListener('click', () => {
    matchBtn.disabled = true;
    statusDiv.textContent = 'Searching for opponent...';
    statusDiv.classList.add('searching');
    socket.emit('findMatch');
});

// Socket.ioイベント
socket.on('waiting', () => {
    statusDiv.textContent = 'Waiting for opponent...';
});

socket.on('matchFound', (data) => {
    console.log('Match found!', data);
    currentMatch = data.matchId;
    playerColor = data.playerColor;
    
    statusDiv.classList.remove('searching');
    statusDiv.textContent = 'Match found! Loading...';
    
    // ゲーム画面に遷移
    setTimeout(() => {
        hideLobby();
        startGame(data);
    }, 1000);
});

socket.on('opponentDisconnected', () => {
    alert('Opponent disconnected. Returning to lobby...');
    location.reload();
});

// ゲーム開始
function startGame(matchData) {
    // game.jsで処理
    if (window.initGame) {
        window.initGame(matchData, socket, playerColor);
    }
}

// ページリロード時に試合を復元
window.addEventListener('load', () => {
    const savedMatch = localStorage.getItem('currentMatch');
    if (savedMatch) {
        const matchData = JSON.parse(savedMatch);
        currentMatch = matchData.matchId;
        playerColor = matchData.playerColor;
        currentState = 'playing';
        
        // ゲームを復元
        setTimeout(() => {
            hideLobby();
            fakeSite.style.display = 'none';
            if (window.initGame) {
                window.initGame(matchData, socket, playerColor);
            }
        }, 100);
    }
});
