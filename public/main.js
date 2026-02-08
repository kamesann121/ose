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
    
    // ロビーに戻ったら試合情報をクリア
    localStorage.removeItem('currentMatch');
    matchBtn.disabled = false;
    statusDiv.textContent = '';
    statusDiv.classList.remove('searching');
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
    returnToLobby();
});

// ゲーム開始
function startGame(matchData) {
    // game.jsで処理
    if (window.initGame) {
        window.initGame(matchData, socket, playerColor);
    }
}

// ロビーに戻る処理
function returnToLobby() {
    localStorage.removeItem('currentMatch');
    document.getElementById('gameContainer').style.display = 'none';
    fakeSite.style.display = 'none';
    lobby.classList.add('active');
    currentState = 'lobby';
    matchBtn.disabled = false;
    statusDiv.textContent = '';
    statusDiv.classList.remove('searching');
    
    // ページをリロードしてクリーンな状態に
    setTimeout(() => {
        location.reload();
    }, 100);
}

// この関数をグローバルに公開（board.jsから呼べるように）
window.returnToLobby = returnToLobby;

// ページロード時の処理
window.addEventListener('load', () => {
    // 古い試合情報は削除
    localStorage.removeItem('currentMatch');
});
