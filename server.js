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
let activeMatches = new Map(); // matchId -> {player1, player2, gameState}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // マッチメイキング
  socket.on('findMatch', () => {
    if (waitingPlayer && waitingPlayer !== socket.id) {
      // マッチング成立
      const matchId = `match_${Date.now()}`;
      const player1 = waitingPlayer;
      const player2 = socket.id;

      // 初期ゲーム状態
      const gameState = {
        matchId,
        player1,
        player2,
        currentTurn: player1,
        stones: [
          { x: 3, z: 3, color: 'white', owner: player1, position: { x: 3, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 0 } },
          { x: 4, z: 4, color: 'white', owner: player1, position: { x: 4, y: 0, z: 4 }, rotation: { x: 0, y: 0, z: 0 } },
          { x: 3, z: 4, color: 'black', owner: player2, position: { x: 3, y: 0, z: 4 }, rotation: { x: 0, y: 0, z: 0 } },
          { x: 4, z: 3, color: 'black', owner: player2, position: { x: 4, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 0 } }
        ],
        startTime: Date.now(),
        duration: 180000, // 3分
        turnStartTime: Date.now(),
        turnDuration: 10000 // 10秒
      };

      activeMatches.set(matchId, gameState);

      // 両プレイヤーにマッチ成立を通知
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
      // 待機リストに追加
      waitingPlayer = socket.id;
      socket.emit('waiting');
    }
  });

  // 石を配置
  socket.on('placeStone', (data) => {
    const match = activeMatches.get(data.matchId);
    if (match && match.currentTurn === socket.id) {
      // ゲーム状態を更新
      match.stones.push(data.stone);
      match.currentTurn = match.currentTurn === match.player1 ? match.player2 : match.player1;
      match.turnStartTime = Date.now();

      // 両プレイヤーに更新を送信
      io.to(match.player1).emit('gameUpdate', match);
      io.to(match.player2).emit('gameUpdate', match);
    }
  });

  // 石の物理状態を更新
  socket.on('updatePhysics', (data) => {
    const match = activeMatches.get(data.matchId);
    if (match) {
      // 石の状態を更新
      const stone = match.stones.find(s => s.id === data.stoneId);
      if (stone) {
        stone.position = data.position;
        stone.rotation = data.rotation;
      }

      // 相手プレイヤーに送信
      const opponentId = socket.id === match.player1 ? match.player2 : match.player1;
      io.to(opponentId).emit('physicsUpdate', data);
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
      // ターンをスキップ
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
    
    // 待機リストから削除
    if (waitingPlayer === socket.id) {
      waitingPlayer = null;
    }

    // アクティブな試合をチェック
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
