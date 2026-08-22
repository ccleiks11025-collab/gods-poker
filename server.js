// server.js - GOD'S HOLD'EM メインサーバー (Express + Socket.io + Wi-Fi自動検出)

import http from 'http';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import express from 'express';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { RoomManager } from './engine/roomManager.js';
import { BotAI } from './engine/botAI.js';
import { ROLE_DEFINITIONS } from './engine/roles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const roomManager = new RoomManager();

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));

// ローカルIPv4アドレスの取得（Wi-Fi / LAN）
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// エラーキャッチ（クラッシュ防止）
process.on('uncaughtException', (err) => {
  console.error('⚠️ 未キャッチの例外が発生しました:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ 未処理のPromise拒否が発生しました:', reason);
});

// サーバー情報API（QRコード生成用）
app.get('/api/server-info', async (req, res) => {
  try {
    const hostHeader = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const serverUrl = hostHeader ? `${protocol}://${hostHeader}` : `http://${getLocalIpAddress()}:${PORT}`;
    const qrDataUrl = await QRCode.toDataURL(serverUrl);
    res.json({
      localIp: getLocalIpAddress(),
      port: PORT,
      serverUrl,
      qrDataUrl,
      roles: ROLE_DEFINITIONS
    });
  } catch (err) {
    console.error('QRコード生成エラー:', err);
    res.status(500).json({ error: 'Server info generation failed' });
  }
});

// 全プレイヤーへ個別セキュリティ視界ステートを配信
function broadcastRoomState(room) {
  const game = room.game;
  room.game.players.forEach(p => {
    if (!p.isBot) {
      const state = game.getPublicState(p.id);
      io.to(p.id).emit('game_state_update', state);
    }
  });

  const spectatorState = game.getPublicState(null);
  io.to(`room_${room.code}_spectators`).emit('spectator_state_update', spectatorState);

  // CPUターンの自動処理
  checkAndTriggerBotTurn(room);
}

// CPUのターン自動実行
function checkAndTriggerBotTurn(room) {
  const game = room.game;
  if (game.phase === 'lobby' || game.phase === 'ended' || game.phase === 'showdown') return;

  const currentActive = game.players[game.activePlayerIndex];
  if (currentActive && currentActive.isBot && !currentActive.folded) {
    if (room.botTimer) clearTimeout(room.botTimer);

    const delay = 900 + Math.floor(Math.random() * 700);
    room.botTimer = setTimeout(() => {
      try {
        const decision = BotAI.decideAction(game, currentActive);
        if (decision) {
          game.handleAction(currentActive.id, decision.action, decision.amount || 0);
          broadcastRoomState(room);
        }
      } catch (err) {
        console.error('Bot action error:', err);
      }
    }, delay);
  }
}

// Socket.io 接続管理
io.on('connection', (socket) => {
  let currentRoomCode = null;

  // 1. 部屋作成
  socket.on('create_room', ({ playerName, startingChips, smallBlind, bigBlind, maxRounds }, callback) => {
    try {
      const room = roomManager.createRoom(socket.id, playerName || 'ホスト', {
        startingChips: Number(startingChips) || 1000,
        smallBlind: Number(smallBlind) || 10,
        bigBlind: Number(bigBlind) || 20,
        maxRounds: Number(maxRounds) || 5
      });

      currentRoomCode = room.code;
      socket.join(socket.id);
      socket.join(`room_${room.code}`);

      callback({ success: true, roomCode: room.code, isHost: true });
      broadcastRoomState(room);
    } catch (err) {
      callback({ success: false, message: err.message });
    }
  });

  // 2. 部屋参加
  socket.on('join_room', ({ roomCode, playerName }, callback) => {
    try {
      const { room, player } = roomManager.joinRoom(roomCode, socket.id, playerName || '名無し');
      currentRoomCode = room.code;
      socket.join(socket.id);
      socket.join(`room_${room.code}`);

      const isHost = room.hostId === socket.id;
      callback({ success: true, roomCode: room.code, isHost });
      broadcastRoomState(room);
    } catch (err) {
      callback({ success: false, message: err.message });
    }
  });

  // 3. CPU追加
  socket.on('add_bot', ({ roomCode }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('部屋が見つかりません');
      if (room.hostId !== socket.id) throw new Error('ホストのみがCPUを追加できます');

      const bot = roomManager.addBot(roomCode);
      if (callback) callback({ success: true, botName: bot.name });
      broadcastRoomState(room);
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 4. CPU削除
  socket.on('remove_bot', ({ roomCode, botId }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('部屋が見つかりません');
      if (room.hostId !== socket.id) throw new Error('ホストのみがCPUを削除できます');

      roomManager.removeBot(roomCode, botId);
      if (callback) callback({ success: true });
      broadcastRoomState(room);
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 4.5. 役職カスタマイズ設定の変更 (ホストのみ)
  socket.on('update_role_settings', ({ roomCode, roleSettings }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('部屋が見つかりません');
      if (room.hostId !== socket.id) throw new Error('ホストのみが役職設定を変更できます');

      const updated = room.game.updateRoleSettings(roleSettings);
      if (callback) callback({ success: true, roleSettings: updated });
      broadcastRoomState(room);
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 5. ゲーム開始 (ホストのみ)
  socket.on('start_game', ({ roomCode }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('部屋が見つかりません');
      if (room.hostId !== socket.id) throw new Error('ホストのみがゲームを開始できます');

      room.game.startRound();
      if (callback) callback({ success: true });
      broadcastRoomState(room);
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 6. プレイヤーアクション (check, call, bet, raise, fold)
  socket.on('player_action', ({ roomCode, action, amount }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('部屋が見つかりません');

      room.game.handleAction(socket.id, action, Number(amount) || 0);
      if (callback) callback({ success: true });
      broadcastRoomState(room);
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 7. 特殊役職スキルの発動
  socket.on('use_skill', ({ roomCode, skillType, params }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('部屋が見つかりません');
      const game = room.game;
      let result = null;

      switch (skillType) {
        case 'god_alteration':
          result = game.useGodAlteration(socket.id, params.targetType, params.targetIndex);
          break;
        case 'cultist_swap':
          result = game.useCultistSwap(socket.id, params.myCardIndex, params.godCardIndex);
          break;
        case 'seer_inspect':
          result = game.useSeerInspect(socket.id, params.targetPlayerId);
          break;
        case 'swindler_redraw':
          result = game.useSwindlerRedraw(socket.id, params.discardIndices);
          break;
        case 'salesman_trade':
          result = game.useSalesmanTrade(socket.id, params.targetPlayerId, params.myCardIndex, params.targetCardIndex);
          break;
        case 'lovers_contract':
          result = game.useLoversContract(socket.id, params.targetPlayerId);
          break;
        case 'jogress_fusion':
          result = game.useJogressFusion(socket.id);
          break;
        case 'revolution_ability':
          result = game.useRevolutionAbility(socket.id, params.reverseType);
          break;
        default:
          throw new Error('不明なスキルです');
      }

      if (callback) callback({ success: true, result });
      broadcastRoomState(room);
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 8. 告発 (Accuse)
  socket.on('accuse_player', ({ roomCode, targetPlayerId, accuseType }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('部屋が見つかりません');

      const result = room.game.accuse(socket.id, targetPlayerId, accuseType);
      if (callback) callback({ success: true, result });
      broadcastRoomState(room);
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 9. ホストによる強制部屋終了＆最終結果表示
  socket.on('force_end_game', ({ roomCode }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('部屋が見つかりません');
      if (room.hostId !== socket.id) throw new Error('ホストのみが部屋を終了できます');

      room.game.forceEndMatch();
      if (callback) callback({ success: true });
      broadcastRoomState(room);
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 10. タイトル（待機室）に戻る
  socket.on('return_to_lobby', ({ roomCode }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('部屋が見つかりません');
      if (room.hostId !== socket.id) throw new Error('ホストのみがタイトルに戻せます');

      room.game.resetToLobby();
      if (callback) callback({ success: true });
      broadcastRoomState(room);
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 11. ホストによる部屋解散（ゲーム開始前待機室）
  socket.on('close_room', ({ roomCode }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('部屋が見つかりません');
      if (room.hostId !== socket.id) throw new Error('ホストのみが部屋を解散できます');

      io.to(`room_${roomCode}`).emit('room_closed', { reason: 'ホストによって部屋が解散されました。' });
      roomManager.removePlayer(socket.id);
      if (callback) callback({ success: true });
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 12. ゲストによる部屋退出（ゲーム開始前待機室）
  socket.on('leave_room', ({ roomCode }, callback) => {
    try {
      const result = roomManager.removePlayer(socket.id);
      socket.leave(`room_${roomCode}`);
      if (callback) callback({ success: true });
      if (result && result.room) {
        broadcastRoomState(result.room);
      }
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // 11. 切断処理
  socket.on('disconnect', () => {
    const result = roomManager.removePlayer(socket.id);
    if (result && result.room) {
      broadcastRoomState(result.room);
    }
  });
});

export { server, PORT, getLocalIpAddress };

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`\n======================================================`);
  console.log(`🎰 GOD'S HOLD'EM サーバーが起動しました！`);
  console.log(`📡 PCからアクセス:  http://localhost:${PORT}`);
  console.log(`📱 スマホからアクセス: http://${localIp}:${PORT}`);
  console.log(`======================================================\n`);
});
