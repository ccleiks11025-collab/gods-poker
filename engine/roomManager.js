// engine/roomManager.js - 部屋（ルーム）のライフサイクル・入室管理

import { PokerGame } from './pokerGame.js';
import { BotAI } from './botAI.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> { game, hostId, createdAt, botTimers }
  }

  generateRoomCode() {
    let code;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostId, hostName, settings = {}) {
    const code = this.generateRoomCode();
    const game = new PokerGame(code, settings);
    game.addPlayer(hostId, hostName, false);

    const room = {
      code,
      hostId,
      game,
      createdAt: Date.now(),
      botTimer: null
    };

    this.rooms.set(code, room);
    return room;
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode) || null;
  }

  joinRoom(roomCode, playerId, playerName) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error('指定された部屋番号（' + roomCode + '）が見つかりません');
    }
    const player = room.game.addPlayer(playerId, playerName, false);
    return { room, player };
  }

  addBot(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('部屋が見つかりません');
    if (room.game.players.length >= 8) throw new Error('最大人数（8名）に達しています');

    const botName = BotAI.getAvailableName(room.game.players);
    const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const bot = room.game.addPlayer(botId, botName, true);
    return bot;
  }

  removeBot(roomCode, botId) {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('部屋が見つかりません');
    room.game.removePlayer(botId);
  }

  removePlayer(playerId) {
    for (const [code, room] of this.rooms.entries()) {
      const p = room.game.players.find(p => p.id === playerId);
      if (p) {
        room.game.removePlayer(playerId);
        // ホストが抜けたら次のプレイヤーをホストに
        if (room.hostId === playerId && room.game.players.length > 0) {
          const nextHuman = room.game.players.find(p => !p.isBot) || room.game.players[0];
          room.hostId = nextHuman.id;
        }
        // 部屋に誰もいなくなったら削除
        const humans = room.game.players.filter(p => !p.isBot);
        if (humans.length === 0) {
          if (room.botTimer) clearTimeout(room.botTimer);
          this.rooms.delete(code);
        }
        return { code, room };
      }
    }
    return null;
  }
}
