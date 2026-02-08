const socket = io();

const fakeSite = document.getElementById('fakeSite');
const lobby = document.getElementById('lobby');
const matchBtn = document.getElementById('matchBtn');
const statusDiv = document.getElementById('status');

let currentState = 'fake';

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '1') {
        e.preventDefault();
        if (currentState === 'fake') {
            fakeSite.style.display = 'none';
            lobby.classList.add('active');
            currentState = 'lobby';
        }
    }
});

matchBtn.addEventListener('click', () => {
    matchBtn.disabled = true;
    statusDiv.textContent = 'Searching for opponent...';
    statusDiv.classList.add('searching');
    socket.emit('findMatch');
    console.log('Finding match...');
});

socket.on('waiting', () => {
    statusDiv.textContent = 'Waiting for opponent...';
    console.log('Waiting...');
});

socket.on('matchFound', (data) => {
    console.log('Match found!', data);
    statusDiv.classList.remove('searching');
    statusDiv.textContent = 'Match found! Loading...';
    
    setTimeout(() => {
        lobby.classList.remove('active');
        fakeSite.style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
        
        if (window.initGame) {
            window.initGame(data, socket, data.playerColor);
        }
    }, 1000);
});

socket.on('opponentDisconnected', () => {
    alert('Opponent disconnected.');
    location.reload();
});
