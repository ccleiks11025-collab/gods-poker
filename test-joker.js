// test/test-joker.js - ジョーカー・神枠ランダム化・ファイブカード動作検証テスト

import assert from 'assert';
import { evaluate5Cards, evaluateBestHand, HAND_NAMES } from '../engine/handEvaluator.js';
import { assignRoles, GOD_LEAD_ROLES, isGodLeadRole } from '../engine/roles.js';
import { PokerGame } from '../engine/pokerGame.js';

console.log('🧪 === 【テスト開始】ジョーカー & ファイブカード検証 ===');

// テスト1: 手役「ファイブカード」の判定
{
  console.log('テスト 1: ファイブカード判定の確認');
  const cards = [
    { suit: '♠', value: 14 },
    { suit: '♥', value: 14 },
    { suit: '♦', value: 14 },
    { suit: '♣', value: 14 },
    { suit: '♠', value: 14 } // 特殊状況: 5枚ともA
  ];
  const evalResult = evaluate5Cards(cards);
  assert.strictEqual(evalResult.rank, 9, 'ファイブカードのランクは9である必要があります');
  assert.strictEqual(evalResult.handName, HAND_NAMES[9]);
  console.log('  ✅ ファイブカード判定 OK:', evalResult.handName);
}

// テスト2: ジョーカー（ワイルド手札2枚）の手役評価
{
  console.log('テスト 2: ジョーカーの手役自動評価 (Wild Cards)');
  // コミュニティカードに3枚のK
  const community = [
    { suit: '♠', value: 13 },
    { suit: '♥', value: 13 },
    { suit: '♦', value: 13 },
    { suit: '♣', value: 2 },
    { suit: '♠', value: 5 }
  ];
  // ジョーカーの手札（ダミーカード2枚、ワイルドフラグtrue）
  const jokerHole = [{ suit: '♠', value: 3 }, { suit: '♥', value: 7 }];
  const bestHand = evaluateBestHand(jokerHole, community, true);

  assert.strictEqual(bestHand.rank, 9, '3枚のK + ワイルド2枚でファイブカードが完成するはずです');
  console.log('  ✅ ジョーカー手役評価 OK:', bestHand.handName);
}

// テスト3: 神枠ランダム割り当て (assignRoles)
{
  console.log('テスト 3: assignRoles での神枠ランダム選出');
  const players = ['p1', 'p2', 'p3', 'p4'];
  let godFound = false;
  let jokerFound = false;

  for (let i = 0; i < 50; i++) {
    const roles = assignRoles(players);
    const assignedRoles = Object.values(roles);
    if (assignedRoles.includes('god')) godFound = true;
    if (assignedRoles.includes('joker')) jokerFound = true;
  }

  assert.ok(godFound, '50回の配分で「神 (god)」が出現するはずです');
  assert.ok(jokerFound, '50回の配分で「ジョーカー (joker)」が出現するはずです');
  console.log('  ✅ 神枠ランダム選出 (god / joker) OK');
}

// テスト4: ジョーカーに対する神告発 (accuse)
{
  console.log('テスト 4: ジョーカーへの神告発テスト');
  const game = new PokerGame('TEST01');
  game.addPlayer('p1', 'プレイヤー1');
  game.addPlayer('p2', 'プレイヤー2');
  game.addPlayer('p3', 'プレイヤー3');

  // 手動で役職固定セット
  game.startRound();
  game.players[0].role = 'joker';
  game.players[1].role = 'seer';
  game.players[2].role = 'swindler';
  game.godPlayerId = 'p1';

  const res = game.accuse('p2', 'p1', 'god');
  assert.strictEqual(res.success, true, 'ジョーカーに対する神告発は成功するはずです');
  assert.strictEqual(game.winnerInfo.winningTeam, 'villager', '村人陣営の勝利になるはずです');
  console.log('  ✅ ジョーカーへの神告発成功 OK:', res.message);
}

// テスト5: ジョーカーの上がり制限（フラッシュ未満では勝利不可）
{
  console.log('テスト 5: ジョーカーの上がり制限（フラッシュ未満不可）');
  const game = new PokerGame('TEST02');
  game.addPlayer('p1', 'ジョーカー');
  game.addPlayer('p2', '村人');

  game.startRound();
  game.players[0].role = 'joker';
  game.players[1].role = 'jobless';
  game.godPlayerId = 'p1';

  // コミュニティカードをバラバラの数字・スートに設定（ストレートやフラッシュが作れない状態）
  game.communityCards = [
    { suit: '♠', value: 2 },
    { suit: '♥', value: 4 },
    { suit: '♦', value: 7 },
    { suit: '♣', value: 9 },
    { suit: '♠', value: 11 }
  ];

  game.evaluateShowdown();
  assert.notStrictEqual(game.winnerInfo.winningTeam, 'god', 'フラッシュ未満の場合、ジョーカー（神陣営）は勝利できないはずです');
  console.log('  ✅ ジョーカーの上がり制限判定 OK: 勝利チーム =', game.winnerInfo.winningTeam);
}

console.log('\n🎉 === 【全テスト合格！】 ===');
