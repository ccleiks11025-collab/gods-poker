// test/test-god-preflop-alter.js - プリフロップでのコミュニティカード1〜3枚目の改変テスト

import assert from 'assert';
import { PokerGame } from '../engine/pokerGame.js';

console.log('🧪 === 【テスト開始】プリフロップでの神の改変 (1〜5枚目全対象) 検証 ===');

const game = new PokerGame('GODTEST');
game.addPlayer('god_id', 'GodPlayer');
game.addPlayer('p2', 'Player2');

// ロールを神に固定
game.startRound();
const godPlayer = game.players.find(p => p.id === 'god_id');
godPlayer.role = 'god';
godPlayer.skillUsesLeft = 3;

assert.strictEqual(game.phase, 'preflop', 'プリフロップ段階');

// プリフロップ中にコミュニティカード1枚目(index 0), 2枚目(index 1), 3枚目(index 2) を交換
for (let idx = 0; idx < 3; idx++) {
  const oldCard = game.communityCards[idx];
  const res = game.useGodAlteration('god_id', 'community', idx);
  assert.ok(res.success, `コミュニティカード ${idx + 1}枚目の改変に成功するはずです`);
  const newCard = game.communityCards[idx];
  assert.notStrictEqual(oldCard, newCard, 'カードが交換されていること');
  console.log(`  ✅ プリフロップで場札 ${idx + 1}枚目 (${oldCard.suit}${oldCard.label} -> ${newCard.suit}${newCard.label}) の交換 OK`);
}

console.log('🎉 === 【プリフロップ神改変テスト全件合格！】 ===');
