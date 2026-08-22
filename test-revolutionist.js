// test/test-revolutionist.js - 革命家 (Revolutionist) & 革命 (強弱逆転) 動作検証テスト

import assert from 'assert';
import { evaluate5Cards, compareScores, evaluateBestHand } from '../engine/handEvaluator.js';
import { ROLE_DEFINITIONS, assignRoles } from '../engine/roles.js';
import { PokerGame } from '../engine/pokerGame.js';

console.log('🧪 === 【テスト開始】革命家 (Revolutionist) & 革命能力検証 ===');

// テスト 1: 役職定義および割当の確認
{
  console.log('テスト 1: 革命家の定義および割当');
  assert.ok(ROLE_DEFINITIONS.revolutionist, 'roles.js に revolutionist が定義されている必要があります');
  assert.strictEqual(ROLE_DEFINITIONS.revolutionist.team, 'neutral');

  const playerIds = ['p1', 'p2', 'p3', 'p4'];
  let revFound = false;
  for (let i = 0; i < 50; i++) {
    const roles = assignRoles(playerIds, { enabledOtherRoles: ['revolutionist'] });
    if (Object.values(roles).includes('revolutionist')) {
      revFound = true;
      break;
    }
  }
  assert.ok(revFound, 'assignRoles で revolutionist が割り当てられる必要があります');
  console.log('  ✅ 革命家定義および割当 OK');
}

// テスト 2: 役の強さ逆転 (handRank)
{
  console.log('テスト 2: 役の強さ逆転 (reverseHandRank)');
  const options = { reverseHandRank: true };
  const highCardScore = [0, 14, 10, 8, 6, 4]; // ハイカード
  const royalFlushScore = [10, 14]; // ロイヤルストレートフラッシュ

  // 通常 rules: RSF > HighCard
  assert.strictEqual(compareScores(royalFlushScore, highCardScore), 1);
  // 役逆転 rules: HighCard > RSF
  assert.strictEqual(compareScores(highCardScore, royalFlushScore, options), 1);
  assert.strictEqual(compareScores(royalFlushScore, highCardScore, options), -1);
  console.log('  ✅ 役の強さ逆転比較 OK (ハイカード > ロイヤルストレートフラッシュ)');
}

// テスト 3: トランプ数字の強さ逆転 (cardValue)
{
  console.log('テスト 3: トランプ数字の強さ逆転 (reverseCardValue)');
  const options = { reverseCardValue: true };

  const cardsNormal = [
    { suit: '♠', value: 2 },
    { suit: '♥', value: 2 },
    { suit: '♦', value: 5 },
    { suit: '♣', value: 9 },
    { suit: '♠', value: 14 } // A
  ];

  const evalRes = evaluate5Cards(cardsNormal, options);
  // reverseCardValue では 2 が 14(最高値) 扱いのため、2のペア (ワンペア、キッカー: A, 9, 5) になる
  assert.strictEqual(evalRes.rank, 1, '数字逆転下でも 2 のペアはワンペアになる必要があります');
  assert.strictEqual(evalRes.score[1], 14, '2 の価値が 14 に変換されてトップペアになっている必要があります');
  console.log('  ✅ 数字の強さ逆転評価 OK (2が最高値14として機能)');
}

// テスト 4: 革命能力発動とログ
{
  console.log('テスト 4: ゲーム中の【革命】能力使用');
  const game = new PokerGame('REV01');
  game.addPlayer('p1', '革命家');
  game.addPlayer('p2', '神');

  game.startRound();
  game.players[0].role = 'revolutionist';
  game.players[0].skillUsesLeft = 1;
  game.players[1].role = 'god';
  game.godPlayerId = 'p2';

  const res = game.useRevolutionAbility('p1', 'handRank');
  assert.strictEqual(res.success, true);
  assert.strictEqual(game.reverses.handRank, true);
  assert.strictEqual(game.players[0].revolutionUsed, true);
  assert.strictEqual(game.players[0].skillUsesLeft, 0);
  console.log('  ✅ 【革命】能力発動 OK');
}

// テスト 5: 革命家の告発不可制限
{
  console.log('テスト 5: 革命家の告発不可制限');
  const game = new PokerGame('REV02');
  game.addPlayer('p1', '革命家');
  game.addPlayer('p2', '神');

  game.startRound();
  game.players[0].role = 'revolutionist';
  game.players[1].role = 'god';
  game.godPlayerId = 'p2';

  assert.throws(() => {
    game.accuse('p1', 'p2', 'god');
  }, /革命家は告発を行うことができません/);
  console.log('  ✅ 革命家の告発禁止 OK');
}

// テスト 6: 革命使用時の勝利条件 (ジョーカー同卓時 vs ジョーカー不在時)
{
  console.log('テスト 6: 革命使用時 ＋ ジョーカー同卓時の勝利判定 (ジョーカーより強い手が必須)');
  const game = new PokerGame('REV03');
  game.addPlayer('p1', '革命家');
  game.addPlayer('p2', 'ジョーカー');
  game.addPlayer('p3', '村人');

  game.startRound();
  game.players[0].role = 'revolutionist';
  game.players[0].skillUsesLeft = 1;
  game.players[1].role = 'joker';
  game.players[2].role = 'jobless';
  game.godPlayerId = 'p2';

  // コミュニティカードをセット（♠が3枚あるのでジョーカーはフラッシュ作成可能）
  game.communityCards = [
    { suit: '♠', value: 2 },
    { suit: '♠', value: 5 },
    { suit: '♠', value: 8 },
    { suit: '♣', value: 11 },
    { suit: '♦', value: 13 }
  ];

  // 革命発動 (役逆転)
  game.useRevolutionAbility('p1', 'handRank');

  // 手札設定: 村人最強手役、ジョーカー(手役制限クリア)、革命家
  game.players[2].holeCards = [{ suit: '♦', value: 2 }, { suit: '♣', value: 5 }]; // ワンペア (役逆転下でジョーカーのフラッシュより強い)
  game.players[1].holeCards = [{ suit: '♠', value: 3 }, { suit: '♠', value: 4 }]; // ジョーカー(ワイルドでフラッシュ作成)
  game.players[0].holeCards = [{ suit: '♥', value: 2 }, { suit: '♣', value: 2 }]; // 革命家もワンペア

  game.evaluateShowdown();

  const winners = game.winnerInfo.winners.map(p => p.role);
  assert.ok(winners.includes('revolutionist'), 'ジョーカーより強い手役を作った革命家は勝利に同行できる必要があります');
  console.log('  ✅ 革命使用 ＋ ジョーカー同卓時の勝利判定 OK:', winners);
}

{
  console.log('テスト 7: 革命使用時 ＋ ジョーカー不在時の勝利判定 (ツーペア以上が必要)');
  const game = new PokerGame('REV04');
  game.addPlayer('p1', '革命家');
  game.addPlayer('p2', '神');
  game.addPlayer('p3', '村人');

  game.startRound();
  game.players[0].role = 'revolutionist';
  game.players[0].skillUsesLeft = 1;
  game.players[1].role = 'god';
  game.players[2].role = 'jobless';
  game.godPlayerId = 'p2';

  // 革命発動 (数字逆転)
  game.useRevolutionAbility('p1', 'cardValue');

  // コミュニティカード: K, K, 5, 4, 3
  game.communityCards = [
    { suit: '♠', value: 13 },
    { suit: '♥', value: 13 },
    { suit: '♦', value: 5 },
    { suit: '♣', value: 4 },
    { suit: '♠', value: 3 }
  ];

  // 革命家の手札: 5, 4 (ツーペア Kペア & 5ペア 完成)
  game.players[0].holeCards = [{ suit: '♠', value: 5 }, { suit: '♥', value: 4 }];
  // 村人の手札: A, 2 (ワンペア Kペア)
  game.players[2].holeCards = [{ suit: '♠', value: 14 }, { suit: '♥', value: 2 }];
  // 神の手札: J, 10
  game.players[1].holeCards = [{ suit: '♠', value: 11 }, { suit: '♥', value: 10 }];

  game.evaluateShowdown();

  const winners = game.winnerInfo.winners.map(p => p.role);
  assert.ok(winners.includes('revolutionist'), 'ツーペア以上を作った革命家は勝利に同行できる必要があります');
  console.log('  ✅ 革命使用 ＋ ジョーカー不在時のツーペア達成勝利 OK:', winners);
}

console.log('\n🎉 === 【全テスト合格！】革命家 (Revolutionist) の検証完了 ===');
