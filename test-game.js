// test/test-game.js - 手役判定・役職能力・終了条件・総合ランキングのテスト

import { Deck } from '../engine/deck.js';
import { evaluate5Cards, evaluateBestHand, compareScores } from '../engine/handEvaluator.js';
import { ROLE_DEFINITIONS, assignRoles, isGodLeadRole } from '../engine/roles.js';
import { PokerGame } from '../engine/pokerGame.js';
import { BotAI } from '../engine/botAI.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

console.log('=== [1] ポーカー手役判定テスト ===');
const royalCards = [
  { suit: '♠', value: 14, label: 'A' },
  { suit: '♠', value: 13, label: 'K' },
  { suit: '♠', value: 12, label: 'Q' },
  { suit: '♠', value: 11, label: 'J' },
  { suit: '♠', value: 10, label: '10' }
];
const royalEval = evaluate5Cards(royalCards);
assert(royalEval.rank === 10, 'ロイヤルストレートフラッシュの判定 (rank 10)');

console.log('\n=== [2] 役職配分テスト ===');
const playerIds8 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const roles8 = assignRoles(playerIds8);
const roleValues = Object.values(roles8);
assert(roleValues.some(r => isGodLeadRole(r)), '8人参加時に必ず「神枠役職(god/joker)」が1名存在する');
assert(new Set(roleValues).size === 8, '8人参加時に全8役職が重複なく割り振られる');
const allRolesHaveWinCondition = Object.values(ROLE_DEFINITIONS).every(r => typeof r.winCondition === 'string' && r.winCondition.length > 0 && typeof r.teamName === 'string');
assert(allRolesHaveWinCondition, '全9役職に固有の勝利条件(winCondition)と陣営名(teamName)が設定されている');

console.log('\n=== [3] 神枠プレイヤーのフォールド不可テスト ===');
const game = new PokerGame('123456');
game.addPlayer('u1', '神プレイヤー');
game.addPlayer('u2', '村人プレイヤー');
game.startRound();

const godPlayer = game.players.find(p => isGodLeadRole(p.role));
game.activePlayerIndex = game.players.indexOf(godPlayer);
let godFoldError = false;
try {
  game.handleAction(godPlayer.id, 'fold');
} catch (e) {
  godFoldError = true;
}
assert(godFoldError, '神枠プレイヤーがフォールドを試みた時にエラーで拒否される');

godPlayer.role = 'god';
godPlayer.skillUsesLeft = 3;
const alterResult = game.useGodAlteration(godPlayer.id, 'hole', 0);
assert(alterResult.success && godPlayer.skillUsesLeft === 2, '神の改変能力が正常に発動');

console.log('\n=== [4] 終了条件テスト（規定ラウンド終了） ===');
const gameRounds = new PokerGame('111111', { maxRounds: 2 });
gameRounds.addPlayer('p1', 'A');
gameRounds.addPlayer('p2', 'B');

gameRounds.startRound();
assert(gameRounds.roundCount === 1 && !gameRounds.isMatchOver, '第1ラウンド終了時点ではマッチ継続');
gameRounds.handleSingleSurvivorWin(gameRounds.players[0]);

gameRounds.startRound();
assert(gameRounds.roundCount === 2, '第2ラウンド開始');
gameRounds.handleSingleSurvivorWin(gameRounds.players[0]);
assert(gameRounds.isMatchOver && gameRounds.finalMatchResults !== null, '最大ラウンド（2ラウンド）終了時にマッチ終了判定となり総合結果が生成される');

console.log('\n=== [5] 終了条件テスト（チップ0破産判定） ===');
const gameBankrupt = new PokerGame('222222', { maxRounds: 10 });
gameBankrupt.addPlayer('p1', '勝者');
gameBankrupt.addPlayer('p2', '敗者');
gameBankrupt.startRound();

// p2のチップを0にする
const p2 = gameBankrupt.players.find(p => p.id === 'p2');
p2.chips = 0;
gameBankrupt.handleSingleSurvivorWin(gameBankrupt.players[0]);
assert(gameBankrupt.isMatchOver && gameBankrupt.finalMatchResults.reason.includes('破産'), 'プレイヤーのチップが0になった時に破産終了判定となる');

console.log('\n=== [6] ホスト手動終了 ＆ タイトル戻りテスト ===');
const gameHostEnd = new PokerGame('333333');
gameHostEnd.addPlayer('host', 'ホスト');
gameHostEnd.addPlayer('guest', 'ゲスト');
gameHostEnd.startRound();

gameHostEnd.forceEndMatch();
assert(gameHostEnd.isMatchOver && gameHostEnd.phase === 'ended', 'ホストによる強制終了が正常に動作');

gameHostEnd.resetToLobby();
assert(gameHostEnd.phase === 'lobby' && !gameHostEnd.isMatchOver, 'タイトル（待機室）への完全リセットが正常に動作');

console.log('\n=== [7] 告発システム＆神・陰陽師制限テスト ===');
const gameAccuse = new PokerGame('444444');
gameAccuse.addPlayer('p_god', '神太郎');
gameAccuse.addPlayer('p_onmyoji', '陰陽次郎');
gameAccuse.addPlayer('p_seer', '占い三郎');
gameAccuse.startRound();

// 役職を固定
const pGod = gameAccuse.players.find(p => p.id === 'p_god');
const pOnmyoji = gameAccuse.players.find(p => p.id === 'p_onmyoji');
const pSeer = gameAccuse.players.find(p => p.id === 'p_seer');
pGod.role = 'god';
pOnmyoji.role = 'onmyoji';
pSeer.role = 'seer';

// 1. 神の告発拒否テスト
let godAccuseBlocked = false;
try {
  gameAccuse.accuse(pGod.id, pOnmyoji.id, 'onmyoji');
} catch (e) {
  if (e.message.includes('告発を行うことができません')) {
    godAccuseBlocked = true;
  }
}
assert(godAccuseBlocked, '神が告発を試みた時にエラーで拒否される');

// 2. 陰陽師の告発拒否テスト
let onmyojiAccuseBlocked = false;
try {
  gameAccuse.accuse(pOnmyoji.id, pGod.id, 'god');
} catch (e) {
  if (e.message.includes('陰陽師は告発を行うことができません')) {
    onmyojiAccuseBlocked = true;
  }
}
assert(onmyojiAccuseBlocked, '陰陽師が告発を試みた時にエラーで拒否される');

// 3. 通常役職（占い師）による神告発成功テスト
const accuseResult = gameAccuse.accuse(pSeer.id, pGod.id, 'god');
assert(accuseResult.success && accuseResult.isGod && gameAccuse.phase === 'ended', '村人役職（占い師）による神告発が成功し即時勝利となる');

console.log(`\n================================`);
console.log(`テスト結果: 合計 ${passed + failed} 件中 ${passed} 件成功, ${failed} 件失敗`);
console.log(`================================`);

if (failed > 0) process.exit(1);
