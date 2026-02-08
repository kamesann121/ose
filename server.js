const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// 静的ファイルの提供
app.use(express.static('public'));

// 待機中のプレイヤーとアクティブな試合を管理
let waitingPlayer = null;
let activeMatches = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // マッチメイキング
  socket.on('findMatch', () => {
    if (waitingPlayer && waitingPlayer !== socket.id) {
      // マッチング成立
      const matchId = `match_${Date.now()}`;
      const player1 = waitingPlayer;
      const player2 = socket.id;

      const gameState = {
        matchId,
        player1,
        player2,
        currentTurn: player1,
        stones: [],
        startTime: Date.now(),
        duration: 180000,
        turnStartTime: Date.now(),
        turnDuration: 10000
      };

      activeMatches.set(matchId, gameState);

      io.to(player1).emit('matchFound', {
        matchId,
        playerColor: 'white',
        opponentId: player2,
        gameState
      });

      io.to(player2).emit('matchFound', {
        matchId,
        playerColor: 'black',
        opponentId: player1,
        gameState
      });

      waitingPlayer = null;
    } else {
      waitingPlayer = socket.id;
      socket.emit('waiting');
    }
  });

  // 石を配置
  socket.on('placeStone', (data) => {
    const match = activeMatches.get(data.matchId);
    if (match && match.currentTurn === socket.id) {
      match.stones.push(data.stone);
      match.currentTurn = match.currentTurn === match.player1 ? match.player2 : match.player1;
      match.turnStartTime = Date.now();

      // 相手に石配置を通知
      const opponentId = socket.id === match.player1 ? match.player2 : match.player1;
      io.to(opponentId).emit('opponentPlaced', { stone: data.stone });

      // 両プレイヤーにゲーム状態更新
      io.to(match.player1).emit('gameUpdate', match);
      io.to(match.player2).emit('gameUpdate', match);
    }
  });

  // 物理状態を更新
  socket.on('updatePhysics', (data) => {
    const match = activeMatches.get(data.matchId);
    if (match) {
      const opponentId = socket.id === match.player1 ? match.player2 : match.player1;
      io.to(opponentId).emit('physicsSync', data);
    }
  });

  // 石の色変更
  socket.on('colorChange', (data) => {
    const match = activeMatches.get(data.matchId);
    if (match) {
      const opponentId = socket.id === match.player1 ? match.player2 : match.player1;
      io.to(opponentId).emit('colorChange', data);
    }
  });

  // 降参
  socket.on('surrender', (data) => {
    const match = activeMatches.get(data.matchId);
    if (match) {
      const winner = socket.id === match.player1 ? match.player2 : match.player1;
      io.to(match.player1).emit('gameOver', { winner, reason: 'surrender' });
      io.to(match.player2).emit('gameOver', { winner, reason: 'surrender' });
      activeMatches.delete(data.matchId);
    }
  });

  // タイムアウト処理
  socket.on('turnTimeout', (data) => {
    const match = activeMatches.get(data.matchId);
    if (match && match.currentTurn === socket.id) {
      match.currentTurn = match.currentTurn === match.player1 ? match.player2 : match.player1;
      match.turnStartTime = Date.now();

      io.to(match.player1).emit('gameUpdate', match);
      io.to(match.player2).emit('gameUpdate', match);
    }
  });

  // 試合終了
  socket.on('gameEnd', (data) => {
    const match = activeMatches.get(data.matchId);
    if (match) {
      io.to(match.player1).emit('gameOver', data);
      io.to(match.player2).emit('gameOver', data);
      activeMatches.delete(data.matchId);
    }
  });

  // 切断処理
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (waitingPlayer === socket.id) {
      waitingPlayer = null;
    }

    for (const [matchId, match] of activeMatches.entries()) {
      if (match.player1 === socket.id || match.player2 === socket.id) {
        const opponent = match.player1 === socket.id ? match.player2 : match.player1;
        io.to(opponent).emit('opponentDisconnected');
        activeMatches.delete(matchId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
