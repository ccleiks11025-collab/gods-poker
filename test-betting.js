// test/test-betting.js - ベッティングターンのフェーズ移行・アクション進行テスト

import assert from 'assert';
import { PokerGame } from '../engine/pokerGame.js';

console.log('🧪 === 【テスト開始】ベッティングターン＆フェーズ進行検証 ===');

// テスト1: プリフロップからフロップへの全員チェック/コールによる正常遷移
{
  console.log('テスト 1: プリフロップ〜フロップ〜ターンまでのターン進行');
  const game = new PokerGame('BET01');
  game.addPlayer('p1', 'Alice');
  game.addPlayer('p2', 'Bob');
  game.addPlayer('p3', 'Charlie');

  game.startRound();
  assert.strictEqual(game.phase, 'preflop');

  // 全員コール/チェック
  let activeId = game.players[game.activePlayerIndex].id;
  game.handleAction(activeId, 'call');

  activeId = game.players[game.activePlayerIndex].id;
  game.handleAction(activeId, 'call');

  activeId = game.players[game.activePlayerIndex].id;
  game.handleAction(activeId, 'check');

  // 全員がプリフロップで1回ずつコール/チェックを完了したらフロップへ遷移
  assert.strictEqual(game.phase, 'flop', 'プリフロップ終了後は flop へ進むはずです');
  console.log('  ✅ フロップ移行 OK:', game.phase);

  // フロップでのベッティング
  // 1人目チェック
  activeId = game.players[game.activePlayerIndex].id;
  game.handleAction(activeId, 'check');
  assert.strictEqual(game.phase, 'flop', '1人目がチェックした時点ではまだ flop のままであるべきです');

  // 2人目チェック
  activeId = game.players[game.activePlayerIndex].id;
  game.handleAction(activeId, 'check');
  assert.strictEqual(game.phase, 'flop', '2人目がチェックした時点ではまだ flop のままであるべきです');

  // 3人目チェック
  activeId = game.players[game.activePlayerIndex].id;
  game.handleAction(activeId, 'check');
  // 全員チェック完了でターンへ
  assert.strictEqual(game.phase, 'turn', '全員チェック完了後に turn へ進むはずです');
  console.log('  ✅ ターン移行 OK:', game.phase);
}

console.log('\n🎉 === 【ベッティングテスト全件合格！】 ===');
