// engine/pokerGame.js - ポーカーゲームの進行・ベッティング・役職能力・勝敗判定・マッチ終了管理

import { Deck, Card, SUITS, RANKS } from './deck.js';
import { evaluateBestHand, compareScores } from './handEvaluator.js';
import { ROLE_DEFINITIONS, assignRoles, isGodLeadRole } from './roles.js';

export class PokerGame {
  constructor(roomCode, settings = {}) {
    this.roomCode = roomCode;
    this.settings = {
      startingChips: settings.startingChips || 1000,
      smallBlind: settings.smallBlind || 10,
      bigBlind: settings.bigBlind || 20,
      maxRounds: settings.maxRounds || 5, // デフォルト5ラウンド
      turnTimeLimit: settings.turnTimeLimit || 30, // 秒
      ...settings
    };

    this.players = []; // { id, name, chips, isBot, role, holeCards: [], currentBet, totalRoundBet, folded, isAllIn, skillUsesLeft, inspected: {}, partnerId, ... }
    this.deck = new Deck();
    this.communityCards = []; // 最大5枚
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.settings.bigBlind;
    
    this.dealerIndex = 0;
    this.activePlayerIndex = 0;
    this.lastBettorIndex = -1;
    this.phase = 'lobby'; // lobby, dealing, preflop, flop, turn, river, showdown, ended
    
    this.godPlayerId = null;
    this.actionHistory = [];
    this.roundCount = 0;
    this.winnerInfo = null;
    this.accusationResult = null;
    this.burnCards = [];

    // マッチ全体の終了管理
    this.isMatchOver = false;
    this.finalMatchResults = null;

    // ラウンド中の逆転状態 (革命効果)
    this.reverses = { handRank: false, cardValue: false };

    // カスタマイズ役職設定（ON/OFFスイッチ）
    this.roleSettings = {
      enabledGodRoles: ['god', 'joker'],
      enabledOtherRoles: ['cultist', 'onmyoji', 'lovers', 'seer', 'swindler', 'salesman', 'jobless', 'jogress', 'revolutionist']
    };
  }

  updateRoleSettings(settings = {}) {
    if (this.phase !== 'lobby' && this.phase !== 'ended') {
      throw new Error('ゲーム進行中は役職設定を変更できません');
    }
    if (settings.enabledGodRoles && Array.isArray(settings.enabledGodRoles) && settings.enabledGodRoles.length > 0) {
      this.roleSettings.enabledGodRoles = settings.enabledGodRoles;
    }
    if (settings.enabledOtherRoles && Array.isArray(settings.enabledOtherRoles) && settings.enabledOtherRoles.length > 0) {
      this.roleSettings.enabledOtherRoles = settings.enabledOtherRoles;
    }
    this.log('⚙️ 役職の構成設定が更新されました。', 'system');
    return this.roleSettings;
  }

  log(message, type = 'info') {
    const entry = { text: message, type, time: new Date().toLocaleTimeString('ja-JP') };
    this.actionHistory.push(entry);
    if (this.actionHistory.length > 50) this.actionHistory.shift();
    return entry;
  }

  addPlayer(id, name, isBot = false) {
    if (this.players.length >= 8) {
      throw new Error('部屋の最大人数（8名）に達しています');
    }
    if (this.phase !== 'lobby' && this.phase !== 'ended') {
      throw new Error('ゲーム進行中は参加できません');
    }

    const existing = this.players.find(p => p.id === id);
    if (existing) {
      existing.name = name;
      return existing;
    }

    const player = {
      id,
      name,
      chips: this.settings.startingChips,
      isBot,
      role: null,
      holeCards: [],
      currentBet: 0,
      totalRoundBet: 0,
      folded: false,
      isAllIn: false,
      skillUsesLeft: 0,
      inspectedRoles: {}, // seer用 { [targetId]: roleId }
      partnerId: null, // lovers用
      accusationUsed: false,
      revolutionUsed: false,
      consecutiveChecks: 0
    };

    this.players.push(player);
    this.log(`プレイヤー「${name}」が参加しました。`);
    return player;
  }

  removePlayer(id) {
    const index = this.players.findIndex(p => p.id === id);
    if (index !== -1) {
      const p = this.players[index];
      this.log(`プレイヤー「${p.name}」が退室しました。`, 'warning');
      this.players.splice(index, 1);
      if (this.dealerIndex >= this.players.length) this.dealerIndex = 0;
    }
  }

  // ゲーム（新ラウンド）開始
  startRound() {
    if (this.players.length < 2) {
      throw new Error('ゲームを開始するには最低2名のプレイヤーが必要です');
    }

    // 既にマッチが終了している場合はリセット
    if (this.isMatchOver) {
      this.resetMatch();
    }

    this.roundCount++;
    this.deck.reset();
    this.communityCards = [];
    this.burnCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.settings.bigBlind;
    this.winnerInfo = null;
    this.accusationResult = null;
    this.reverses = { handRank: false, cardValue: false };

    // 役職割り当て（カスタマイズ設定を適用）
    const playerIds = this.players.map(p => p.id);
    const roleMap = assignRoles(playerIds, this.roleSettings);

    this.players.forEach(p => {
      p.role = roleMap[p.id];
      const roleDef = ROLE_DEFINITIONS[p.role];
      p.skillUsesLeft = roleDef.maxSkillUses || 0;
      p.holeCards = [];
      p.currentBet = 0;
      p.totalRoundBet = 0;
      p.roundStartChips = p.chips;
      p.folded = false;
      p.isAllIn = false;
      p.inspectedRoles = {};
      p.partnerId = null;
      p.accusationUsed = false;
      p.revolutionUsed = false;
      p.hasActed = false;
      if (isGodLeadRole(p.role)) {
        this.godPlayerId = p.id;
      }
    });

    // ディーラー移動
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;

    // 手札配布 (各2枚)
    for (let i = 0; i < 2; i++) {
      for (const p of this.players) {
        p.holeCards.push(this.deck.draw(1));
      }
    }

    // 未公開コミュニティカード5枚を準備（神には最初から見える）
    for (let i = 0; i < 5; i++) {
      this.communityCards.push(this.deck.draw(1));
    }

    this.phase = 'preflop';
    this.log(`=== 第 ${this.roundCount} / ${this.settings.maxRounds} 局 開始 ===`, 'system');
    this.log(`役職と手札が配布されました。`);

    // ブラインドベット処理
    this.postBlinds();

    return this.getPublicState();
  }

  // マッチのリセット（再戦時）
  resetMatch() {
    this.roundCount = 0;
    this.isMatchOver = false;
    this.finalMatchResults = null;
    this.players.forEach(p => {
      p.chips = this.settings.startingChips;
      p.folded = false;
      p.isAllIn = false;
    });
  }

  // ロビー状態への完全リセット
  resetToLobby() {
    this.phase = 'lobby';
    this.roundCount = 0;
    this.isMatchOver = false;
    this.finalMatchResults = null;
    this.winnerInfo = null;
    this.pot = 0;
    this.currentBet = 0;
    this.communityCards = [];
    this.players.forEach(p => {
      p.chips = this.settings.startingChips;
      p.role = null;
      p.holeCards = [];
      p.folded = false;
      p.isAllIn = false;
      p.currentBet = 0;
      p.totalRoundBet = 0;
      p.skillUsesLeft = 0;
      p.inspectedRoles = {};
      p.partnerId = null;
      p.accusationUsed = false;
    });
    this.log('🏠 ホストによりゲームが終了し、タイトル画面（待機室）に戻りました。', 'system');
  }

  // ホストによる強制終了
  forceEndMatch() {
    this.phase = 'ended';
    this.checkMatchEndCondition('ホストによりゲームが終了されました。', true);
  }

  // マッチ終了条件チェック（破産判定 または 規定ラウンド終了）
  checkMatchEndCondition(customReason = '', force = false) {
    let shouldEnd = force;
    let reason = customReason;

    if (!shouldEnd) {
      // 1. チップが0以下のプレイヤー（無職除く）が存在するか
      const bankruptPlayers = this.players.filter(p => p.role !== 'jobless' && p.chips <= 0);
      if (bankruptPlayers.length > 0) {
        shouldEnd = true;
        reason = `💥 ${bankruptPlayers.map(p => p.name).join(', ')} の所持チップが0（破産）になりました！`;
      }
      // 2. 規定ラウンド終了判定
      else if (this.roundCount >= this.settings.maxRounds) {
        shouldEnd = true;
        reason = `🏁 設定された全 ${this.settings.maxRounds} 局が終了しました！`;
      }
    }

    if (shouldEnd) {
      this.isMatchOver = true;
      
      // チップランキング算出 (降順)
      const ranked = [...this.players].sort((a, b) => b.chips - a.chips);
      this.finalMatchResults = {
        reason,
        roundsPlayed: this.roundCount,
        maxRounds: this.settings.maxRounds,
        rankings: ranked.map((p, idx) => ({
          rank: idx + 1,
          id: p.id,
          name: p.name,
          chips: p.chips,
          isBot: p.isBot
        })),
        winner: ranked[0]
      };

      this.log(`🏆 【全ゲーム終了】${reason}`, 'win');
      this.log(`👑 総合優勝: ${ranked[0].name} (所持チップ: $${ranked[0].chips.toLocaleString()})`, 'special');
    }

    return shouldEnd;
  }

  postBlinds() {
    const n = this.players.length;
    const sbIndex = (this.dealerIndex + 1) % n;
    const bbIndex = (this.dealerIndex + 2) % n;

    const sbPlayer = this.players[sbIndex];
    const bbPlayer = this.players[bbIndex];

    const sbAmount = Math.min(sbPlayer.chips, this.settings.smallBlind);
    const bbAmount = Math.min(bbPlayer.chips, this.settings.bigBlind);

    this.placeBet(sbPlayer, sbAmount);
    this.placeBet(bbPlayer, bbAmount);

    this.currentBet = bbAmount;
    this.minRaise = this.settings.bigBlind;

    // プリフロップのアクティブプレイヤーはBBの次 (UTG)
    this.activePlayerIndex = (bbIndex + 1) % n;
    this.lastBettorIndex = bbIndex;

    this.log(`${sbPlayer.name} がスモールブラインド ($${sbAmount}) をベット`);
    this.log(`${bbPlayer.name} がビッグブラインド ($${bbAmount}) をベット`);
  }

  placeBet(player, amount) {
    // 無職 (jobless) はチップを消費しない
    if (player.role === 'jobless') {
      player.currentBet += amount;
      player.totalRoundBet += amount;
      this.pot += amount;
      return amount;
    }

    const actualAmount = Math.min(player.chips, amount);
    player.chips -= actualAmount;
    player.currentBet += actualAmount;
    player.totalRoundBet += actualAmount;
    this.pot += actualAmount;

    if (player.chips === 0) {
      player.isAllIn = true;
    }
    return actualAmount;
  }

  // プレイヤーのアクション実行 (fold, check, call, bet, raise)
  handleAction(playerId, action, amount = 0) {
    const player = this.players[this.activePlayerIndex];
    if (!player || player.id !== playerId) {
      throw new Error('あなたのターンではありません');
    }
    if (player.folded) {
      throw new Error('既にフォールドしています');
    }

    const callAmount = this.currentBet - player.currentBet;
    player.hasActed = true;

    switch (action) {
      case 'fold': {
        if (isGodLeadRole(player.role)) {
          throw new Error('神陣営の主役役職はフォールドできません！最後まで盤面に君臨する必要があります。');
        }
        player.folded = true;
        this.log(`${player.name} がフォールドしました。`, 'fold');
        this.checkLoversDeath(player.id);
        break;
      }

      case 'check': {
        if (callAmount > 0) {
          throw new Error(`コールに必要なチップ ($${callAmount}) があります。チェックはできません。`);
        }
        this.log(`${player.name} がチェックしました。`, 'action');
        break;
      }

      case 'call': {
        if (callAmount <= 0) {
          this.log(`${player.name} がチェックしました。`, 'action');
        } else {
          this.placeBet(player, callAmount);
          this.log(`${player.name} が $${callAmount} をコールしました。(Total Bet: $${player.currentBet})`, 'action');
        }
        break;
      }

      case 'bet':
      case 'raise': {
        const totalTarget = amount;
        if (totalTarget <= this.currentBet) {
          throw new Error(`現在のベット額 ($${this.currentBet}) より大きい額を指定してください`);
        }
        const needed = totalTarget - player.currentBet;
        if (player.role !== 'jobless' && needed > player.chips) {
          throw new Error('チップが不足しています');
        }

        const raiseDiff = totalTarget - this.currentBet;
        if (raiseDiff < this.minRaise && player.chips > needed) {
          throw new Error(`最低レイズ額は +$${this.minRaise} 以上必要です`);
        }

        this.minRaise = Math.max(this.minRaise, raiseDiff);
        this.currentBet = totalTarget;
        this.lastBettorIndex = this.activePlayerIndex;
        this.placeBet(player, needed);

        // レイズが発生したため、他の未フォールド・未オールインのプレイヤーの hasActed をリセット
        this.players.forEach(p => {
          if (p.id !== player.id && !p.folded && !p.isAllIn) {
            p.hasActed = false;
          }
        });

        this.log(`${player.name} が $${totalTarget} にレイズしました！`, 'raise');
        break;
      }

      default:
        throw new Error(`不明なアクションです: ${action}`);
    }

    // 1人を除いて全員フォールドしたか確認
    const activePlayers = this.players.filter(p => !p.folded);
    if (activePlayers.length === 1) {
      this.handleSingleSurvivorWin(activePlayers[0]);
      return this.getPublicState();
    }

    // 次のプレイヤーまたは次フェーズへ進行
    this.advanceTurn();
    return this.getPublicState();
  }

  // ターン・フェーズの進行
  advanceTurn() {
    const activeNonFolded = this.players.filter(p => !p.folded);
    const activeMovable = activeNonFolded.filter(p => !p.isAllIn);

    // 全員が当フェーズでアクションを終え、ベット額が揃っているか判定
    const phaseComplete = activeNonFolded.every(p =>
      p.isAllIn || (p.hasActed && p.currentBet === this.currentBet)
    );

    if (phaseComplete || activeMovable.length <= 1) {
      this.advancePhase();
      return;
    }

    // 次のアクション可能なプレイヤーへターンを進める
    const n = this.players.length;
    let nextIndex = (this.activePlayerIndex + 1) % n;
    while (this.players[nextIndex].folded || this.players[nextIndex].isAllIn) {
      nextIndex = (nextIndex + 1) % n;
    }
    this.activePlayerIndex = nextIndex;
  }

  // 次のベッティングフェーズに進む
  advancePhase() {
    this.players.forEach(p => {
      p.currentBet = 0;
      p.hasActed = false;
    });
    this.currentBet = 0;
    this.minRaise = this.settings.bigBlind;

    const n = this.players.length;
    this.activePlayerIndex = (this.dealerIndex + 1) % n;
    while (this.players[this.activePlayerIndex].folded || this.players[this.activePlayerIndex].isAllIn) {
      this.activePlayerIndex = (this.activePlayerIndex + 1) % n;
    }
    this.lastBettorIndex = this.activePlayerIndex;

    switch (this.phase) {
      case 'preflop':
        this.phase = 'flop';
        this.log('🎴 【フロップ】コミュニティカード3枚が公開されました！', 'phase');
        break;
      case 'turn':
        this.phase = 'river';
        this.log('🎴 【リバー】最後のコミュニティカードが公開されました！', 'phase');
        break;
      case 'flop':
        this.phase = 'turn';
        this.log('🎴 【ターン】コミュニティカード4枚目が公開されました！', 'phase');
        break;
      case 'river':
        this.phase = 'showdown';
        this.log('⚔️ 【ショーダウン】勝負！', 'phase');
        this.evaluateShowdown();
        return;
    }

    const activeMovable = this.players.filter(p => !p.folded && !p.isAllIn);
    if (activeMovable.length <= 1 && this.phase !== 'showdown' && this.phase !== 'ended') {
      this.advancePhase();
    }
  }

  buildPlayerResults() {
    return this.players.map(p => {
      const start = p.roundStartChips !== undefined ? p.roundStartChips : p.chips;
      const end = p.chips;
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        startChips: start,
        endChips: end,
        netChange: end - start,
        folded: p.folded
      };
    });
  }

  // 他プレイヤー全員がフォールドした場合の勝敗処理
  handleSingleSurvivorWin(survivor) {
    this.phase = 'ended';
    this.log(`🏆 他の全員がフォールドしたため、${survivor.name} の勝利！`, 'win');
    
    if (survivor.role !== 'jobless') {
      survivor.chips += this.pot;
    } else {
      this.log(`（無職のためポットのチップは獲得できません）`);
    }

    this.winnerInfo = {
      winners: [survivor],
      winningHandName: '不戦勝 (全員フォールド)',
      winningTeam: survivor.role === 'god' ? 'god' : 'villager',
      pot: this.pot,
      playerResults: this.buildPlayerResults(),
      showdownHands: this.players.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        cards: p.holeCards,
        handName: p.folded ? 'フォールド' : '不戦勝'
      }))
    };

    // マッチ終了条件判定
    this.checkMatchEndCondition();
  }

  // ショーダウン時の手役評価と勝利判定
  evaluateShowdown() {
    this.phase = 'ended';
    const survivors = this.players.filter(p => !p.folded);

    const evaluatedList = survivors.map(p => {
      const best = evaluateBestHand(p.holeCards, this.communityCards, p.role === 'joker', this.reverses);
      return {
        player: p,
        bestHand: best
      };
    });

    evaluatedList.sort((a, b) => -compareScores(a.bestHand.score, b.bestHand.score, this.reverses));
    const bestScore = evaluatedList[0].bestHand.score;
    const topWinners = evaluatedList.filter(item => compareScores(item.bestHand.score, bestScore, this.reverses) >= 0);

    const godPlayer = this.players.find(p => isGodLeadRole(p.role));
    const godSurvived = godPlayer && !godPlayer.folded;
    let godIsTop = topWinners.some(w => w.player.id === this.godPlayerId);

    // ジョーカーの上がり制限（手役がフラッシュ＝rank 5 以上でなければ勝利不可）
    if (godSurvived && godIsTop && godPlayer.role === 'joker') {
      const godItem = topWinners.find(w => w.player.id === godPlayer.id);
      if (godItem && godItem.bestHand.rank < 5) {
        godIsTop = false;
        this.log(`⚠️ ジョーカー（${godPlayer.name}）の手役「${godItem.bestHand.handName}」はフラッシュ未満のため勝利条件（上がり）を満たせませんでした。`, 'warning');
      }
    }

    const onmyojiPlayer = this.players.find(p => p.role === 'onmyoji');
    const onmyojiSurvived = onmyojiPlayer && !onmyojiPlayer.folded;

    const loversPlayer = this.players.find(p => p.role === 'lovers');
    let winningTeam = 'villager';
    let specialWinReason = '';
    let finalWinners = [];

    // 勝敗分岐ルール
    if (godSurvived && godIsTop) {
      if (onmyojiSurvived) {
        winningTeam = 'neutral';
        finalWinners = [onmyojiPlayer];
        specialWinReason = `☯️ 陰陽師（${onmyojiPlayer.name}）が生存していたため、神の勝利を乗っ取り単独勝利！！`;
        this.log(specialWinReason, 'special');
      } else {
        winningTeam = 'god';
        finalWinners = [godPlayer];
        const cultist = this.players.find(p => p.role === 'cultist');
        if (cultist && !cultist.folded) {
          finalWinners.push(cultist);
        }
        const godRoleDef = ROLE_DEFINITIONS[godPlayer.role];
        specialWinReason = `${godRoleDef.icon} ${godRoleDef.name}（${godPlayer.name}）が最強の役で完全勝利！`;
        this.log(specialWinReason, 'win');
      }
    } else {
      winningTeam = 'villager';
      const winnerPlayers = topWinners.map(w => w.player);

      if (loversPlayer && loversPlayer.partnerId) {
        const partner = this.players.find(p => p.id === loversPlayer.partnerId);
        const loversInWinners = winnerPlayers.some(p => p.id === loversPlayer.id || p.id === loversPlayer.partnerId);
        if (loversInWinners) {
          winningTeam = 'lovers';
          finalWinners = [loversPlayer, partner].filter(Boolean);
          specialWinReason = `💕 恋人ペア（${loversPlayer.name} & ${partner?.name}）が愛の勝利を掴み取りました！`;
          this.log(specialWinReason, 'special');
        } else {
          finalWinners = winnerPlayers;
          specialWinReason = `🏆 村人陣営（${winnerPlayers.map(p => p.name).join(', ')}）の勝利！`;
        }
      } else {
        finalWinners = winnerPlayers;
        specialWinReason = `🏆 村人陣営（${winnerPlayers.map(p => p.name).join(', ')}）の勝利！`;
      }

      // 革命家 (Revolutionist) の勝利同行・判定
      const revolutionistPlayer = this.players.find(p => p.role === 'revolutionist');
      if (revolutionistPlayer && !revolutionistPlayer.folded) {
        const revInWinners = finalWinners.some(p => p.id === revolutionistPlayer.id);
        if (!revInWinners) {
          if (!revolutionistPlayer.revolutionUsed) {
            // 革命未使用時: 無条件で村勝利に同行
            finalWinners.push(revolutionistPlayer);
            this.log(`🚩 革命家（${revolutionistPlayer.name}）は能力未使用のため、村人陣営と共に勝利！`, 'special');
          } else {
            // 革命使用時
            const revBest = evaluateBestHand(revolutionistPlayer.holeCards, this.communityCards, false, this.reverses);
            if (godPlayer && godPlayer.role === 'joker') {
              // (A) ジョーカー同卓時: ジョーカーより強い手役が必要
              const jokerBest = evaluateBestHand(godPlayer.holeCards, this.communityCards, true, this.reverses);
              const isStronger = compareScores(revBest.score, jokerBest.score, this.reverses) > 0;
              if (isStronger) {
                finalWinners.push(revolutionistPlayer);
                this.log(`🚩 革命家（${revolutionistPlayer.name}）はジョーカーの手役を超えることに成功し、共に勝利！`, 'special');
              } else {
                this.log(`⚠️ 革命家（${revolutionistPlayer.name}）は【革命】を発動したものの、ジョーカーの手役を超えることができず敗北…`, 'warning');
              }
            } else {
              // (B) ジョーカー不在時: ツーペア(rank 2)以上が必要
              if (revBest.rank >= 2) {
                finalWinners.push(revolutionistPlayer);
                this.log(`🚩 革命家（${revolutionistPlayer.name}）はツーペア以上の手役（${revBest.handName}）を達成し、共に勝利！`, 'special');
              } else {
                this.log(`⚠️ 革命家（${revolutionistPlayer.name}）は【革命】を発動したものの、ツーペア以上の手役を作れなかったため敗北…`, 'warning');
              }
            }
          }
        }
      }

      this.log(specialWinReason, 'win');
    }

    // チップ分配
    const chipReceivers = finalWinners.filter(p => p.role !== 'jobless');
    if (chipReceivers.length > 0) {
      const share = Math.floor(this.pot / chipReceivers.length);
      chipReceivers.forEach(p => {
        p.chips += share;
      });
    }

    this.winnerInfo = {
      winners: finalWinners,
      winningHandName: topWinners[0].bestHand.handName,
      winningTeam,
      specialWinReason,
      pot: this.pot,
      playerResults: this.buildPlayerResults(),
      showdownHands: this.players.map(p => {
        const best = evaluateBestHand(p.holeCards, this.communityCards, p.role === 'joker', this.reverses);
        return {
          id: p.id,
          name: p.name,
          role: p.role,
          cards: p.holeCards,
          handName: p.folded ? 'フォールド' : best.handName,
          score: best.score,
          folded: p.folded
        };
      })
    };

    // マッチ終了条件判定
    this.checkMatchEndCondition();
  }

  // 告発システム (Accuse)
  accuse(accuserPlayerId, targetPlayerId, accuseType) {
    const accuser = this.players.find(p => p.id === accuserPlayerId);
    const target = this.players.find(p => p.id === targetPlayerId);

    if (!accuser || !target) throw new Error('プレイヤーが見つかりません');
    if (isGodLeadRole(accuser.role)) throw new Error('神陣営の主役役職は告発を行うことができません');
    if (accuser.role === 'onmyoji') throw new Error('陰陽師は告発を行うことができません');
    if (accuser.role === 'revolutionist') throw new Error('革命家は告発を行うことができません');
    if (accuser.folded) throw new Error('フォールドしたプレイヤーは告発できません');
    if (accuser.id === target.id) throw new Error('自分自身を告発することはできません');
    if (accuser.accusationUsed) throw new Error('告発は1ゲームに1回のみ行えます');

    accuser.accusationUsed = true;
    this.log(`🚨 【告発】${accuser.name} が ${target.name} を「${accuseType === 'god' ? '👑 神' : '☯️ 陰陽師'}」として告発しました！`, 'warning');

    if (accuseType === 'god') {
      if (isGodLeadRole(target.role)) {
        this.phase = 'ended';
        let winningTeam = 'villager';
        let winners = this.players.filter(p => !isGodLeadRole(p.role) && p.role !== 'cultist' && !p.folded);

        const lovers = this.players.find(p => p.role === 'lovers');
        if (lovers && lovers.partnerId) {
          const partner = this.players.find(p => p.id === lovers.partnerId);
          if (partner && !isGodLeadRole(partner.role)) {
            winningTeam = 'lovers';
            winners = [lovers, partner];
          }
        }

        const targetRoleDef = ROLE_DEFINITIONS[target.role];
        const msg = `🎉 見事的中！${target.name} は【${targetRoleDef.icon} ${targetRoleDef.name}】でした！村人陣営の即時勝利！！`;
        this.log(msg, 'win');

        const chipWinners = winners.filter(p => p.role !== 'jobless');
        if (chipWinners.length > 0) {
          const share = Math.floor(this.pot / chipWinners.length);
          chipWinners.forEach(p => p.chips += share);
        }

        this.winnerInfo = {
          winners,
          winningHandName: '神告発成功による即時勝利',
          winningTeam,
          specialWinReason: msg,
          pot: this.pot,
          playerResults: this.buildPlayerResults(),
          showdownHands: this.players.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            cards: p.holeCards,
            handName: isGodLeadRole(p.role) ? `${targetRoleDef.icon} ${targetRoleDef.name} (告発暴き)` : '生存'
          }))
        };

        // マッチ終了条件判定
        this.checkMatchEndCondition();
        return { success: true, isGod: true, message: msg };
      } else {
        accuser.folded = true;
        const msg = `❌ 告発失敗… ${target.name} は神陣営の主役役職ではありませんでした。${accuser.name} はペナルティとして強制フォールドとなります。`;
        this.log(msg, 'penalty');
        this.checkLoversDeath(accuser.id);
        this.handleFoldTurnCheck();
        return { success: false, isGod: false, message: msg };
      }
    } else if (accuseType === 'onmyoji') {
      if (target.role === 'onmyoji') {
        target.folded = true;
        const msg = `⚡ 的中！${target.name} は【☯️ 陰陽師】でした！陰陽師は強制フォールドとなり、神勝利の乗っ取りは阻止されました！`;
        this.log(msg, 'success');
        this.checkLoversDeath(target.id);
        this.handleFoldTurnCheck();
        return { success: true, isOnmyoji: true, message: msg };
      } else {
        accuser.folded = true;
        const msg = `❌ 告発失敗… ${target.name} は陰陽師ではありませんでした。${accuser.name} は強制フォールドとなります。`;
        this.log(msg, 'penalty');
        this.checkLoversDeath(accuser.id);
        this.handleFoldTurnCheck();
        return { success: false, isOnmyoji: false, message: msg };
      }
    }
  }

  // フォールド発生後のターン・フェーズ進行チェック
  handleFoldTurnCheck() {
    const alive = this.players.filter(p => !p.folded);
    if (alive.length === 1) {
      this.handleSingleSurvivorWin(alive[0]);
      return;
    }

    if (this.players[this.activePlayerIndex].folded) {
      this.advanceTurn();
    } else {
      const activeNonFolded = this.players.filter(p => !p.folded);
      const everyoneActed = activeNonFolded.every(p => p.isAllIn || p.currentBet === this.currentBet);
      if (everyoneActed) {
        this.advanceTurn();
      }
    }
  }

  checkLoversDeath(deadPlayerId) {
    const lovers = this.players.find(p => p.role === 'lovers');
    if (!lovers || !lovers.partnerId) return;

    if (lovers.id === deadPlayerId) {
      const partner = this.players.find(p => p.id === lovers.partnerId);
      if (partner && partner.role === 'god') {
      } else if (partner && !partner.folded) {
        partner.folded = true;
        this.log(`💔 恋人の死に伴い、${partner.name} も後を追ってフォールドしました。`, 'special');
      }
    } else if (lovers.partnerId === deadPlayerId) {
      if (!lovers.folded) {
        lovers.folded = true;
        this.log(`💔 パートナーの死に伴い、恋人（${lovers.name}）も後を追ってフォールドしました。`, 'special');
      }
    }
  }

  // --- 役職固有のスキル処理 ---

  useGodAlteration(playerId, targetType, targetIndex) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.role !== 'god') throw new Error('神のみが使用できる能力です');
    if (player.skillUsesLeft <= 0) throw new Error('神の改変能力の残り使用回数がありません');

    let oldCard = null;
    if (targetType === 'hole') {
      if (targetIndex < 0 || targetIndex >= player.holeCards.length) throw new Error('無効な手札番号です');
      oldCard = player.holeCards[targetIndex];
      const newCard = this.deck.swapWithTop(oldCard);
      player.holeCards[targetIndex] = newCard;
      player.skillUsesLeft--;
      return { success: true, newCard, remaining: player.skillUsesLeft };
    } else if (targetType === 'community') {
      let visibleCount = 0;
      if (this.phase === 'flop') visibleCount = 3;
      if (this.phase === 'turn') visibleCount = 4;
      if (this.phase === 'river' || this.phase === 'showdown' || this.phase === 'ended') visibleCount = 5;

      if (visibleCount >= 5) {
        throw new Error('既に全てのコミュニティカードが公開されています');
      }
      if (targetIndex < visibleCount || targetIndex >= 5) {
        throw new Error('公開済みのコミュニティカードは改変できません（未公開のカードを選択してください）');
      }

      oldCard = this.communityCards[targetIndex];
      const newCard = this.deck.swapWithTop(oldCard);
      this.communityCards[targetIndex] = newCard;
      player.skillUsesLeft--;
      return { success: true, newCard, remaining: player.skillUsesLeft };
    }
    throw new Error('無効な対象指定です');
  }

  useCultistSwap(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.role !== 'cultist') throw new Error('狂信者のみが使用できる能力です');
    if (player.skillUsesLeft <= 0) throw new Error('既に能力を使用済みです');

    const god = this.players.find(p => isGodLeadRole(p.role));
    if (!god) throw new Error('神陣営の主役が存在しません');

    // 自分の手札で一番強いカード（valueが最大）
    let myStrongestIdx = 0;
    for (let i = 1; i < player.holeCards.length; i++) {
      if (player.holeCards[i].value > player.holeCards[myStrongestIdx].value) {
        myStrongestIdx = i;
      }
    }

    // 神（またはジョーカー）の手札で一番弱いカード（valueが最小）
    let godWeakestIdx = 0;
    for (let i = 1; i < god.holeCards.length; i++) {
      if (god.holeCards[i].value < god.holeCards[godWeakestIdx].value) {
        godWeakestIdx = i;
      }
    }

    const myCard = player.holeCards[myStrongestIdx];
    const godCard = god.holeCards[godWeakestIdx];

    player.holeCards[myStrongestIdx] = godCard;
    god.holeCards[godWeakestIdx] = myCard;
    player.skillUsesLeft = 0;

    this.log('🩸 場のどこかで【狂信の献上】が実行されました…', 'special');
    return { success: true, myNewCard: godCard, myGivenCard: myCard };
  }

  useSeerInspect(playerId, targetPlayerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.role !== 'seer') throw new Error('占い師のみが使用できる能力です');
    if (player.skillUsesLeft <= 0) throw new Error('既に能力を使用済みです');

    const target = this.players.find(p => p.id === targetPlayerId);
    if (!target) throw new Error('対象プレイヤーが見つかりません');
    if (target.id === playerId) throw new Error('自分自身を占うことはできません');

    player.inspectedRoles[target.id] = target.role;
    player.skillUsesLeft = 0;

    this.log('🔮 誰かが【役職透視】を発動しました…', 'special');
    return { success: true, targetId: target.id, targetName: target.name, role: target.role };
  }

  useSwindlerRedraw(playerId, discardIndices = [0]) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.role !== 'swindler') throw new Error('詐欺師のみが使用できる能力です');
    if (player.skillUsesLeft <= 0) throw new Error('既に能力を使用済みです');

    const drawnCards = [];
    discardIndices.forEach(idx => {
      if (idx >= 0 && idx < player.holeCards.length) {
        const newCard = this.deck.draw(1);
        player.holeCards[idx] = newCard;
        drawnCards.push(newCard);
      }
    });

    player.skillUsesLeft = 0;
    this.log('🃏 誰かが【イカサマ引き直し】を実行しました！', 'special');
    return { success: true, newCards: player.holeCards };
  }

  useSalesmanTrade(playerId, targetPlayerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.role !== 'salesman') throw new Error('営業マンのみが使用できる能力です');
    if (player.skillUsesLeft <= 0) throw new Error('既に能力を使用済みです');

    const target = this.players.find(p => p.id === targetPlayerId);
    if (!target) throw new Error('対象プレイヤーが見つかりません');
    if (target.id === playerId) throw new Error('自分自身と交換することはできません');

    // 自分の手札で一番弱いカード（valueが最小）
    let myWeakestIdx = 0;
    for (let i = 1; i < player.holeCards.length; i++) {
      if (player.holeCards[i].value < player.holeCards[myWeakestIdx].value) {
        myWeakestIdx = i;
      }
    }

    // 対象プレイヤーの手札で一番強いカード（valueが最大）
    let targetStrongestIdx = 0;
    for (let i = 1; i < target.holeCards.length; i++) {
      if (target.holeCards[i].value > target.holeCards[targetStrongestIdx].value) {
        targetStrongestIdx = i;
      }
    }

    const myCard = player.holeCards[myWeakestIdx];
    const targetCard = target.holeCards[targetStrongestIdx];

    player.holeCards[myWeakestIdx] = targetCard;
    target.holeCards[targetStrongestIdx] = myCard;
    player.skillUsesLeft = 0;

    this.log('💼 場のどこかで【押し売りトレード】が発生しました！', 'special');
    return { success: true, myNewCard: targetCard, myGivenCard: myCard };
  }

  useLoversContract(playerId, targetPlayerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.role !== 'lovers') throw new Error('恋人のみが使用できる能力です');
    if (player.skillUsesLeft <= 0) throw new Error('既にパートナーと契約済みです');

    const target = this.players.find(p => p.id === targetPlayerId);
    if (!target) throw new Error('対象プレイヤーが見つかりません');
    if (target.id === playerId) throw new Error('自分自身と契約することはできません');

    player.partnerId = target.id;
    target.partnerId = player.id;
    player.skillUsesLeft = 0;

    this.log('💕 誰かが【運命の契約】を結びました！', 'special');
    return { success: true, partnerName: target.name };
  }

  useJogressFusion(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.role !== 'jogress') throw new Error('ジョグレスのみが使用できる能力です');
    if (player.skillUsesLeft <= 0) throw new Error('既に能力を使用済みです');
    if (player.holeCards.length < 2) throw new Error('手札が不足しています');

    const card1 = player.holeCards[0];
    const card2 = player.holeCards[1];

    // A(14)は計算上1として扱う
    const v1 = card1.value === 14 ? 1 : card1.value;
    const v2 = card2.value === 14 ? 1 : card2.value;
    const sum = v1 + v2;

    const findSuitObj = (suitSymbol) => SUITS.find(s => s.symbol === suitSymbol) || SUITS[0];
    const findRankObj = (val) => RANKS.find(r => r.value === val) || RANKS[0];

    const suitObj1 = findSuitObj(card1.suit);
    const suitObj2 = findSuitObj(card2.suit);

    if (sum <= 14) {
      // 合計14以下: 1枚目が合成カード (sum===14ならA:14)、2枚目は山札から引く
      const val1 = sum === 14 ? 14 : sum;
      const rankObj1 = findRankObj(val1);
      const newCard1 = new Card(suitObj1, rankObj1);
      const drawnCard2 = this.deck.draw(1);

      player.holeCards = [newCard1, drawnCard2];
    } else {
      // 合計15以上: 1枚目はA(14)、2枚目は余り数値 (sum - 14) (1ならA)
      const remainder = sum - 14;
      const rankObj1 = findRankObj(14); // A
      const val2 = remainder === 1 ? 14 : remainder;
      const rankObj2 = findRankObj(val2);

      const newCard1 = new Card(suitObj1, rankObj1);
      const newCard2 = new Card(suitObj2, rankObj2);

      player.holeCards = [newCard1, newCard2];
    }

    player.skillUsesLeft = 0;
    this.log('🧬 誰かが【ジョグレス合成】を実行しました！', 'special');
    return { success: true, newCards: player.holeCards };
  }

  useRevolutionAbility(playerId, reverseType) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.role !== 'revolutionist') throw new Error('革命家のみが使用できる能力です');
    if (player.skillUsesLeft <= 0) throw new Error('既に【革命】能力を使用済みです');
    if (reverseType !== 'handRank' && reverseType !== 'cardValue') throw new Error('無効な革命選択です');

    player.skillUsesLeft = 0;
    player.revolutionUsed = true;

    if (reverseType === 'handRank') {
      this.reverses.handRank = true;
      this.log('🚩 誰かが【革命】を発動しました！（【役の強さ】が逆転中！ロイヤルストレートフラッシュが最弱、ハイカードが最強！）', 'special');
    } else if (reverseType === 'cardValue') {
      this.reverses.cardValue = true;
      this.log('🚩 誰かが【革命】を発動しました！（【数字の強さ】が逆転中！２が最強、Aが最弱！）', 'special');
    }

    return { success: true, reverseType, reverses: this.reverses };
  }

  // 各クライアントに送信する公開状態データ
  getPublicState(viewerId = null) {
    const viewer = this.players.find(p => p.id === viewerId);
    const isGod = viewer && viewer.role === 'god';
    const isCultist = viewer && viewer.role === 'cultist';
    const isOnmyoji = viewer && viewer.role === 'onmyoji';
    const isLovers = viewer && viewer.role === 'lovers';
    const isSeer = viewer && viewer.role === 'seer';

    let visibleCount = 0;
    if (this.phase === 'flop') visibleCount = 3;
    else if (this.phase === 'turn') visibleCount = 4;
    else if (this.phase === 'river' || this.phase === 'showdown' || this.phase === 'ended') visibleCount = 5;

    const publicCommunityCards = this.communityCards.map((card, index) => {
      if (isGod || this.phase === 'showdown' || this.phase === 'ended' || index < visibleCount) {
        return {
          ...card,
          isRevealed: index < visibleCount,
          isGodPeek: isGod && index >= visibleCount
        };
      }
      return { hidden: true, isRevealed: false };
    });

    const sanitizedPlayers = this.players.map((p, idx) => {
      const isSelf = p.id === viewerId;
      const isShowdown = this.phase === 'showdown' || this.phase === 'ended';
      
      let visibleCards = null;
      if (isSelf || isGod || isShowdown) {
        visibleCards = p.holeCards;
      } else {
        visibleCards = p.holeCards.map(() => ({ hidden: true }));
      }

      let visibleRole = null;
      if (isSelf || isShowdown) {
        visibleRole = p.role;
      } else if ((isCultist || isOnmyoji) && isGodLeadRole(p.role)) {
        visibleRole = p.role;
      } else if (isSeer && viewer.inspectedRoles[p.id]) {
        visibleRole = viewer.inspectedRoles[p.id];
      } else if (isLovers && viewer.partnerId === p.id) {
        visibleRole = p.role;
      }

      return {
        id: p.id,
        name: p.name,
        chips: p.chips,
        isBot: p.isBot,
        role: visibleRole,
        holeCards: visibleCards,
        currentBet: p.currentBet,
        totalRoundBet: p.totalRoundBet,
        folded: p.folded,
        isAllIn: p.isAllIn,
        skillUsesLeft: isSelf ? p.skillUsesLeft : undefined,
        partnerId: (isSelf || isShowdown) ? p.partnerId : undefined,
        isDealer: idx === this.dealerIndex,
        isActive: idx === this.activePlayerIndex && this.phase !== 'showdown' && this.phase !== 'ended',
        roleDef: visibleRole ? ROLE_DEFINITIONS[visibleRole] : null
      };
    });

    let myBestHand = null;
    if (viewer && viewer.holeCards.length > 0) {
      const availableCommunity = this.communityCards.slice(0, visibleCount);
      myBestHand = evaluateBestHand(viewer.holeCards, availableCommunity, viewer.role === 'joker', this.reverses);
    }

    return {
      roomCode: this.roomCode,
      phase: this.phase,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      dealerIndex: this.dealerIndex,
      activePlayerIndex: this.activePlayerIndex,
      communityCards: publicCommunityCards,
      players: sanitizedPlayers,
      roundCount: this.roundCount,
      maxRounds: this.settings.maxRounds,
      isMatchOver: this.isMatchOver,
      finalMatchResults: this.finalMatchResults,
      actionHistory: this.actionHistory.slice(-15),
      winnerInfo: this.winnerInfo,
      godPlayerId: (isGod || isCultist || isOnmyoji || this.phase === 'showdown' || this.phase === 'ended') ? this.godPlayerId : null,
      myBestHand,
      viewerRole: viewer ? viewer.role : null,
      viewerRoleDef: viewer && viewer.role ? ROLE_DEFINITIONS[viewer.role] : null,
      viewerSkillUsesLeft: viewer ? viewer.skillUsesLeft : 0,
      roleSettings: this.roleSettings,
      reverses: this.reverses
    };
  }
}
