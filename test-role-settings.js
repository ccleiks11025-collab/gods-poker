// test/test-role-settings.js - 役職カスタマイズ (Ban/Pick) 単体テスト

import assert from 'assert';
import { assignRoles } from '../engine/roles.js';
import { PokerGame } from '../engine/pokerGame.js';

console.log('🧪 === 【テスト開始】役職スイッチング（出現設定）検証 ===');

// テスト1: 神枠を「ジョーカー」のみに固定
{
  console.log('テスト 1: 神枠を【ジョーカー】に固定して役職配分');
  const players = ['p1', 'p2', 'p3'];
  const customSettings = {
    enabledGodRoles: ['joker'],
    enabledOtherRoles: ['cultist', 'onmyoji', 'seer']
  };

  for (let i = 0; i < 20; i++) {
    const roles = assignRoles(players, customSettings);
    const assignedValues = Object.values(roles);
    assert.ok(assignedValues.includes('joker'), '神枠として常にジョーカーが選ばれるべきです');
    assert.ok(!assignedValues.includes('god'), '神(god)は無効化されているため出現しないはずです');
  }
  console.log('  ✅ 神枠固定（ジョーカーのみ） OK');
}

// テスト2: 神枠を「神」のみに固定
{
  console.log('テスト 2: 神枠を【神 (god)】に固定して役職配分');
  const players = ['p1', 'p2', 'p3'];
  const customSettings = {
    enabledGodRoles: ['god'],
    enabledOtherRoles: ['cultist', 'onmyoji', 'seer']
  };

  for (let i = 0; i < 20; i++) {
    const roles = assignRoles(players, customSettings);
    const assignedValues = Object.values(roles);
    assert.ok(assignedValues.includes('god'), '神枠として常に神(god)が選ばれるべきです');
    assert.ok(!assignedValues.includes('joker'), 'ジョーカーは無効化されているため出現しないはずです');
  }
  console.log('  ✅ 神枠固定（神のみ） OK');
}

// テスト3: その他役職のフィルター（特定役職のみ出現）
{
  console.log('テスト 3: その他役職を【占い師】と【狂信者】のみに制限');
  const players = ['p1', 'p2', 'p3'];
  const customSettings = {
    enabledGodRoles: ['god', 'joker'],
    enabledOtherRoles: ['seer', 'cultist']
  };

  for (let i = 0; i < 20; i++) {
    const roles = assignRoles(players, customSettings);
    const assignedValues = Object.values(roles);
    // 他のプレイヤーの役職は seer, cultist のみ（または補填の jobless）
    const otherAssigned = assignedValues.filter(r => r !== 'god' && r !== 'joker');
    otherAssigned.forEach(r => {
      assert.ok(['seer', 'cultist', 'jobless'].includes(r), `無効な役職 ${r} は選出されないはずです`);
    });
  }
  console.log('  ✅ その他役職の絞り込みフィルター OK');
}

// テスト4: PokerGame での設定更新メソッド (updateRoleSettings)
{
  console.log('テスト 4: PokerGame クラスの updateRoleSettings メソッド動作確認');
  const game = new PokerGame('SET01');
  game.addPlayer('h1', 'Host');
  game.addPlayer('g1', 'Guest');

  game.updateRoleSettings({
    enabledGodRoles: ['joker'],
    enabledOtherRoles: ['seer']
  });

  assert.strictEqual(game.roleSettings.enabledGodRoles[0], 'joker');
  assert.strictEqual(game.roleSettings.enabledOtherRoles[0], 'seer');

  game.startRound();
  const assigned = Object.values(game.players.map(p => p.role));
  assert.ok(assigned.includes('joker'), '設定適用後にジョーカーが配分されるべきです');
  console.log('  ✅ PokerGame 設定更新 ＆ 反映 OK');
}

console.log('\n🎉 === 【役職スイッチングテスト全件合格！】 ===');
