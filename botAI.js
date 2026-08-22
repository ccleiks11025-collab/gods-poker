// engine/botAI.js - CPUプレイヤー（ボット）の思考ルーチン

import { evaluateBestHand } from './handEvaluator.js';
import { isGodLeadRole } from './roles.js';

export const BOT_NAMES = [
  'ALICE (AI)',
  'BOB (AI)',
  'CHARLIE (AI)',
  'DIANA (AI)',
  'EDWARD (AI)',
  'FIONA (AI)',
  'GEORGE (AI)'
];

export class BotAI {
  static getAvailableName(existingPlayers) {
    const existingNames = new Set(existingPlayers.map(p => p.name));
    for (const name of BOT_NAMES) {
      if (!existingNames.has(name)) return name;
    }
    return `BOT_${Math.floor(Math.random() * 1000)}`;
  }

  // CPUのアクション決定
  static decideAction(game, botPlayer) {
    if (botPlayer.folded) return null;

    const callAmount = game.currentBet - botPlayer.currentBet;
    const isGodLead = isGodLeadRole(botPlayer.role);
    const isJobless = botPlayer.role === 'jobless';

    // 1. スキル使用の判断
    this.maybeUseSkill(game, botPlayer);

    // 2. 現在のカードの評価
    let visibleCount = 0;
    if (game.phase === 'flop') visibleCount = 3;
    else if (game.phase === 'turn') visibleCount = 4;
    else if (game.phase === 'river') visibleCount = 5;

    const visibleCommunity = game.communityCards.slice(0, visibleCount);
    const evaluation = evaluateBestHand(botPlayer.holeCards, visibleCommunity, botPlayer.role === 'joker');
    const handRank = evaluation.rank;

    // 3. 無職 (jobless) はリスク0なので強気
    if (isJobless) {
      if (Math.random() < 0.35 && game.currentBet < 200) {
        const raiseTarget = game.currentBet + game.minRaise;
        return { action: 'raise', amount: raiseTarget };
      }
      return callAmount === 0 ? { action: 'check' } : { action: 'call' };
    }

    // 4. 神陣営主役 (god, joker) はフォールド不可
    if (isGodLead) {
      // 役が強いか、あるいはpreflopで強気立ち回り
      if (handRank >= 2 || (game.phase === 'preflop' && Math.random() < 0.5)) {
        if (Math.random() < 0.6 && botPlayer.chips >= callAmount + game.minRaise) {
          return { action: 'raise', amount: game.currentBet + game.minRaise };
        }
      }
      return callAmount === 0 ? { action: 'check' } : { action: 'call' };
    }

    // 5. 通常プレイヤーの判断
    // チェック可能な場合
    if (callAmount === 0) {
      // 強い役ならベット
      if (handRank >= 2 && Math.random() < 0.5 && botPlayer.chips >= game.minRaise) {
        return { action: 'raise', amount: game.currentBet + game.minRaise };
      }
      return { action: 'check' };
    }

    // コールが必要な場合
    const potOdds = callAmount / (game.pot + callAmount);
    
    // 役が強い、またはコール額が小さい場合
    if (handRank >= 2 || (handRank === 1 && callAmount <= 50) || (callAmount <= game.settings.bigBlind && Math.random() < 0.8)) {
      // かなり強い役ならレイズ
      if (handRank >= 3 && Math.random() < 0.4 && botPlayer.chips >= callAmount + game.minRaise) {
        return { action: 'raise', amount: game.currentBet + game.minRaise };
      }
      return { action: 'call' };
    }

    // 手が弱く、コール額が大きい場合はフォールド
    if (callAmount > botPlayer.chips * 0.3 || (handRank === 0 && callAmount > 30)) {
      if (Math.random() < 0.75) {
        return { action: 'fold' };
      }
    }

    return { action: 'call' };
  }

  // CPUのスキル自動使用
  static maybeUseSkill(game, bot) {
    if (bot.skillUsesLeft <= 0) return;

    try {
      if (bot.role === 'god') {
        // 神：手札が弱ければ改変（値が10以下の手札があれば交換）
        const weakCardIdx = bot.holeCards.findIndex(c => c.value < 10);
        if (weakCardIdx !== -1 && Math.random() < 0.6) {
          game.useGodAlteration(bot.id, 'hole', weakCardIdx);
        }
      } else if (bot.role === 'seer') {
        // 占い師：まだ占っていない相手を占う
        const targets = game.players.filter(p => p.id !== bot.id && !bot.inspectedRoles[p.id]);
        if (targets.length > 0 && Math.random() < 0.5) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          game.useSeerInspect(bot.id, target.id);
        }
      } else if (bot.role === 'swindler') {
        // 詐欺師：手札が弱ければ引き直す
        const weak = bot.holeCards.filter(c => c.value < 9);
        if (weak.length > 0 && Math.random() < 0.6) {
          const indices = bot.holeCards.map((c, i) => c.value < 9 ? i : -1).filter(i => i >= 0);
          game.useSwindlerRedraw(bot.id, indices.length > 0 ? indices : [0]);
        }
      } else if (bot.role === 'cultist') {
        // 狂信者：神陣営ボスと交換（自分の手札が弱い時に交換）
        const god = game.players.find(p => isGodLeadRole(p.role));
        if (god && Math.random() < 0.4) {
          game.useCultistSwap(bot.id);
        }
      } else if (bot.role === 'lovers') {
        // 恋人：ランダムな相手と契約
        const targets = game.players.filter(p => p.id !== bot.id);
        if (targets.length > 0 && Math.random() < 0.5) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          game.useLoversContract(bot.id, target.id);
        }
      }
    } catch (e) {
      // スキル使用失敗時はスキップ
    }
  }
}
