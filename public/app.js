// public/js/app.js - クライアント側ゲームコントローラー (confirm撤廃・完全安定版)

const socket = io();

// アプリケーション状態
const state = {
  roomCode: null,
  isHost: false,
  myId: null,
  gameState: null,
  selectedAccuseTarget: null,
  selectedAccuseType: 'god',
  selectedSkillParams: {},
  currentRenderedRound: 0,
  currentRenderedPhase: null,
  hostForceEndConfirmPending: false,
  wasMyTurn: false
};

// DOM要素の参照
const dom = {
  screens: {
    lobby: document.getElementById('screen-lobby'),
    waiting: document.getElementById('screen-waiting'),
    game: document.getElementById('screen-game')
  },
  modals: {
    roles: document.getElementById('modal-roles-guide'),
    myRoleDetail: document.getElementById('modal-my-role-detail'),
    skill: document.getElementById('modal-skill-action'),
    accuse: document.getElementById('modal-accuse'),
    result: document.getElementById('modal-result'),
    finalResult: document.getElementById('modal-final-result'),
    qr: document.getElementById('modal-qr'),
    roleSettings: document.getElementById('modal-role-settings')
  },
  // ロビー
  formCreate: document.getElementById('form-create-room'),
  formJoin: document.getElementById('form-join-room'),
  // 待機室
  waitingRoomCode: document.getElementById('waiting-room-code'),
  waitingPlayerCount: document.getElementById('waiting-player-count'),
  waitingPlayerList: document.getElementById('waiting-player-list'),
  hostControls: document.getElementById('host-controls'),
  guestControls: document.getElementById('guest-controls'),
  btnAddBot: document.getElementById('btn-add-bot'),
  btnStartGame: document.getElementById('btn-start-game'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  // ゲーム卓
  roundCount: document.getElementById('game-round-count'),
  phaseBadge: document.getElementById('game-phase-badge'),
  potVal: document.getElementById('game-pot-val'),
  currentBetVal: document.getElementById('game-current-bet'),
  centerPotText: document.getElementById('center-pot-text'),
  communityCardsRow: document.getElementById('community-cards-row'),
  opponentsContainer: document.getElementById('opponents-container'),
  hostGameControls: document.getElementById('host-game-controls'),
  btnHostForceEnd: document.getElementById('btn-host-force-end'),
  // プレイヤー自身
  myRoleBadge: document.getElementById('my-role-badge-trigger'),
  myRoleIcon: document.getElementById('my-role-icon'),
  myRoleName: document.getElementById('my-role-name'),
  myRoleTeam: document.getElementById('my-role-team'),
  myChipsVal: document.getElementById('my-chips-val'),
  myHoleCards: document.getElementById('my-hole-cards'),
  myHandEval: document.getElementById('my-current-hand-eval'),
  btnUseSkill: document.getElementById('btn-use-skill'),
  skillBadge: document.getElementById('skill-remaining-badge'),
  btnOpenAccuse: document.getElementById('btn-open-accuse'),
  // ベッティング
  btnFold: document.getElementById('btn-action-fold'),
  btnCall: document.getElementById('btn-action-call'),
  callMainText: document.getElementById('call-main-text'),
  callSubText: document.getElementById('call-sub-text'),
  btnRaise: document.getElementById('btn-action-raise'),
  raiseMainText: document.getElementById('raise-main-text'),
  betSlider: document.getElementById('bet-slider'),
  raiseTargetVal: document.getElementById('raise-target-val'),
  // ログ
  logMessages: document.getElementById('log-messages'),
  logToggle: document.getElementById('log-drawer-toggle'),
  logDrawer: document.getElementById('log-drawer'),
  // 最終結果モーダル & リザルト
  finalResultReason: document.getElementById('final-result-reason'),
  finalWinnerName: document.getElementById('final-winner-name'),
  finalWinnerChips: document.getElementById('final-winner-chips'),
  finalRankingList: document.getElementById('final-ranking-list'),
  btnReturnLobby: document.getElementById('btn-return-lobby'),
  btnViewFinalResult: document.getElementById('btn-view-final-result'),
  guestResultWaitMsg: document.getElementById('guest-result-wait-msg')
};

// 革命発動ポップアップ演出を表示
function triggerRevolutionPopup(reverseType) {
  const overlay = document.getElementById('revolution-pop-overlay');
  const subEl = document.getElementById('revolution-pop-sub');
  const descEl = document.getElementById('revolution-pop-desc');
  if (!overlay || !subEl || !descEl) return;

  if (reverseType === 'handRank') {
    subEl.textContent = '【ポーカー役の強さ】が反転しました！';
    descEl.textContent = '最弱のハイカードが最強、ロイヤルストレートフラッシュが最弱！';
  } else if (reverseType === 'cardValue') {
    subEl.textContent = '【トランプ数字の強さ】が反転しました！';
    descEl.textContent = '２が最強カード、エース(A)が最弱カードになります！';
  }

  if (window.soundManager && window.soundManager.playSkill) {
    window.soundManager.playSkill();
  }

  overlay.classList.add('active');
  setTimeout(() => {
    overlay.classList.remove('active');
  }, 2800);
}

// 画面切り替え
function switchScreen(screenName) {
  Object.values(dom.screens).forEach(el => el.classList.remove('active'));
  if (dom.screens[screenName]) {
    dom.screens[screenName].classList.add('active');
  }
}

// モーダル開閉
function openModal(modalEl) {
  if (modalEl) modalEl.classList.add('active');
}
function closeModal(modalEl) {
  if (modalEl) modalEl.classList.remove('active');
}

// モーダル閉じるボタンのイベント設定
document.querySelectorAll('.btn-close-modal, [data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const modalId = btn.getAttribute('data-close') || btn.closest('.modal-overlay')?.id;
    if (modalId && document.getElementById(modalId)) {
      closeModal(document.getElementById(modalId));
    }
  });
});

// ヘッダーボタン
document.getElementById('btn-show-roles').addEventListener('click', () => openModal(dom.modals.roles));
document.getElementById('btn-show-qr').addEventListener('click', () => {
  loadServerQr();
  openModal(dom.modals.qr);
});
document.getElementById('btn-toggle-sound').addEventListener('click', () => {
  const enabled = window.soundManager.toggleSound();
  document.getElementById('sound-icon').textContent = enabled ? '🔊' : '🔇';
});

// QRコードの取得
async function loadServerQr() {
  try {
    const res = await fetch('/api/server-info');
    const data = await res.json();
    document.getElementById('qr-code-img').src = data.qrDataUrl;
    document.getElementById('qr-url-text').textContent = data.serverUrl;
  } catch (err) {
    console.error('QR fetch error:', err);
  }
}

// ==========================================
// 1. ロビー & 待機室イベント
// ==========================================

// 部屋作成
dom.formCreate.addEventListener('submit', (e) => {
  e.preventDefault();
  window.soundManager.init();

  const name = document.getElementById('create-name').value.trim();
  const chips = document.getElementById('starting-chips').value;
  const bb = document.getElementById('big-blind').value;
  const maxRounds = document.getElementById('max-rounds').value;

  socket.emit('create_room', {
    playerName: name,
    startingChips: chips,
    smallBlind: Math.floor(bb / 2),
    bigBlind: bb,
    maxRounds: maxRounds
  }, (res) => {
    if (res.success) {
      state.roomCode = res.roomCode;
      state.isHost = true;
      state.myId = socket.id;
      dom.waitingRoomCode.textContent = res.roomCode;
      dom.hostControls.style.display = 'block';
      dom.guestControls.style.display = 'none';
      switchScreen('waiting');
    } else {
      alert('エラー: ' + res.message);
    }
  });
});

// 部屋参加
dom.formJoin.addEventListener('submit', (e) => {
  e.preventDefault();
  window.soundManager.init();

  const code = document.getElementById('join-code').value.trim();
  const name = document.getElementById('join-name').value.trim();

  socket.emit('join_room', {
    roomCode: code,
    playerName: name
  }, (res) => {
    if (res.success) {
      state.roomCode = res.roomCode;
      state.isHost = res.isHost;
      state.myId = socket.id;
      dom.waitingRoomCode.textContent = res.roomCode;
      dom.hostControls.style.display = res.isHost ? 'block' : 'none';
      dom.guestControls.style.display = res.isHost ? 'none' : 'block';
      switchScreen('waiting');
    } else {
      alert('参加失敗: ' + res.message);
    }
  });
});

// CPU追加
dom.btnAddBot.addEventListener('click', () => {
  socket.emit('add_bot', { roomCode: state.roomCode }, (res) => {
    if (!res.success) alert(res.message);
  });
});

// ゲーム開始
dom.btnStartGame.addEventListener('click', () => {
  socket.emit('start_game', { roomCode: state.roomCode }, (res) => {
    if (!res.success) alert(res.message);
  });
});

// 部屋番号コピー
dom.btnCopyCode.addEventListener('click', () => {
  if (state.roomCode) {
    navigator.clipboard.writeText(state.roomCode);
    dom.btnCopyCode.textContent = '✅ コピー完了！';
    setTimeout(() => { dom.btnCopyCode.textContent = '📋 番号をコピー'; }, 2000);
  }
});

// ホスト専用：部屋を終了して最終結果を表示（二段階インライン確認）
dom.btnHostForceEnd.addEventListener('click', () => {
  if (!state.hostForceEndConfirmPending) {
    state.hostForceEndConfirmPending = true;
    dom.btnHostForceEnd.textContent = '⚠️ 本当に終了？（もう一度タップ）';
    dom.btnHostForceEnd.classList.add('btn-danger');
    setTimeout(() => {
      state.hostForceEndConfirmPending = false;
      dom.btnHostForceEnd.textContent = '🚪 部屋終了';
      dom.btnHostForceEnd.classList.remove('btn-danger');
    }, 3500);
    return;
  }

  // 確定
  state.hostForceEndConfirmPending = false;
  dom.btnHostForceEnd.textContent = '🚪 部屋終了';
  dom.btnHostForceEnd.classList.remove('btn-danger');

  socket.emit('force_end_game', { roomCode: state.roomCode }, (res) => {
    if (!res.success) alert(res.message);
  });
});

// タイトル（待機室）に戻る
dom.btnReturnLobby.addEventListener('click', () => {
  closeModal(dom.modals.finalResult);
  closeModal(dom.modals.result);
  if (state.isHost) {
    socket.emit('return_to_lobby', { roomCode: state.roomCode });
  } else {
    switchScreen('waiting');
  }
});

// ホスト専用：待機室で部屋を解散する
const btnCloseRoomEl = document.getElementById('btn-close-room');
if (btnCloseRoomEl) {
  btnCloseRoomEl.addEventListener('click', () => {
    if (confirm('本当に部屋を閉じますか？参加中のプレイヤーも退出します。')) {
      socket.emit('close_room', { roomCode: state.roomCode }, (res) => {
        if (res.success) {
          state.roomCode = null;
          state.isHost = false;
          switchScreen('lobby');
        } else {
          alert(res.message);
        }
      });
    }
  });
}

// ゲスト専用：待機室から退出する
const btnLeaveRoomEl = document.getElementById('btn-leave-room');
if (btnLeaveRoomEl) {
  btnLeaveRoomEl.addEventListener('click', () => {
    socket.emit('leave_room', { roomCode: state.roomCode }, (res) => {
      if (res.success) {
        state.roomCode = null;
        state.isHost = false;
        switchScreen('lobby');
      } else {
        alert(res.message);
      }
    });
  });
}

// ==========================================
// 2. リアルタイムゲーム同期
// ==========================================

socket.on('game_state_update', (gameState) => {
  state.gameState = gameState;
  renderGame(gameState);
});

socket.on('room_closed', (data) => {
  alert(data?.reason || '部屋が解散されました。');
  state.roomCode = null;
  state.isHost = false;
  closeModal(dom.modals.result);
  closeModal(dom.modals.finalResult);
  switchScreen('lobby');
});

function renderGame(gs) {
  // 画面ルーティング
  if (gs.phase === 'lobby') {
    closeModal(dom.modals.result);
    closeModal(dom.modals.finalResult);
    closeModal(dom.modals.skill);
    closeModal(dom.modals.accuse);
    switchScreen('waiting');
    renderWaitingRoom(gs);
    return;
  } else {
    switchScreen('game');
  }

  // 新ラウンド進行中（phase !== 'ended'）の場合、すべてのリザルトモーダルを即座に閉じる
  if (gs.phase !== 'ended') {
    closeModal(dom.modals.result);
    closeModal(dom.modals.finalResult);

    if (state.currentRenderedRound !== gs.roundCount) {
      window.soundManager.playDeal();
    }
  }
  state.currentRenderedRound = gs.roundCount;
  state.currentRenderedPhase = gs.phase;

  // ホスト専用コントロールの表示
  dom.hostGameControls.style.display = state.isHost ? 'block' : 'none';

  // 卓上トップバー更新
  dom.roundCount.textContent = `${gs.roundCount} / ${gs.maxRounds} 局`;
  dom.phaseBadge.textContent = gs.phase.toUpperCase();
  dom.potVal.textContent = `$${gs.pot.toLocaleString()}`;
  dom.currentBetVal.textContent = `$${gs.currentBet.toLocaleString()}`;
  dom.centerPotText.textContent = `$${gs.pot.toLocaleString()}`;

  // 革命中バナーの更新 & 発動ポップアップ検知
  const revBanner = document.getElementById('revolution-banner');
  const revBannerText = document.getElementById('revolution-banner-text');
  if (gs.reverses) {
    const prevHand = state.lastReverses?.handRank;
    const prevCard = state.lastReverses?.cardValue;

    if (!prevHand && gs.reverses.handRank) {
      triggerRevolutionPopup('handRank');
    } else if (!prevCard && gs.reverses.cardValue) {
      triggerRevolutionPopup('cardValue');
    }
    state.lastReverses = { ...gs.reverses };

    if (revBanner && revBannerText) {
      if (gs.reverses.handRank || gs.reverses.cardValue) {
        revBanner.style.display = 'flex';
        if (gs.reverses.handRank) {
          revBannerText.textContent = '【革命発動中】役の強さ逆転！';
        } else if (gs.reverses.cardValue) {
          revBannerText.textContent = '【革命発動中】数字の強さ逆転！';
        }
      } else {
        revBanner.style.display = 'none';
      }
    }
  }

  // コミュニティカード描画
  renderCommunityCards(gs.communityCards);

  // 他プレイヤー描画
  renderOpponents(gs.players);

  // 自身（手札・役職・ベッティング）描画
  renderSelfDock(gs);

  // ログ描画
  renderLogs(gs.actionHistory);

  // 終了フェーズ時のモーダル判定
  if (gs.phase === 'ended') {
    if (gs.winnerInfo) {
      renderResultModal(gs.winnerInfo, gs.isMatchOver);
    } else if (gs.isMatchOver && gs.finalMatchResults) {
      renderFinalResultModal(gs.finalMatchResults);
    }
  }
}

// 待機室の描画
function renderWaitingRoom(gs) {
  state.lastReverses = { handRank: false, cardValue: false };
  dom.waitingPlayerCount.textContent = gs.players.length;
  dom.waitingPlayerList.innerHTML = '';

  gs.players.forEach((p, idx) => {
    const isSelf = p.id === socket.id;
    const card = document.createElement('div');
    card.className = `player-slot-card ${isSelf ? 'is-self' : ''}`;
    card.innerHTML = `
      <div class="player-avatar">${p.isBot ? '🤖' : '👤'}</div>
      <div class="player-info-wrap">
        <div class="player-name-text">${escapeHtml(p.name)}</div>
        <div class="player-tags">
          ${idx === 0 ? '<span class="tag-badge tag-host">HOST</span>' : ''}
          ${p.isBot ? '<span class="tag-badge tag-bot">CPU</span>' : ''}
          ${isSelf ? '<span class="tag-badge tag-you">YOU</span>' : ''}
        </div>
      </div>
      ${state.isHost && p.isBot ? `<button class="btn-remove-bot" data-bot-id="${p.id}" title="CPUを削除">×</button>` : ''}
    `;
    dom.waitingPlayerList.appendChild(card);
  });

  document.querySelectorAll('.btn-remove-bot').forEach(btn => {
    btn.addEventListener('click', () => {
      const botId = btn.getAttribute('data-bot-id');
      socket.emit('remove_bot', { roomCode: state.roomCode, botId });
    });
  });

  // 役職構成プレビューの更新
  renderRoleSettingsPreview(gs.roleSettings);
}

// トランプカード要素の生成
function createCardElement(card, isGodPeek = false) {
  const el = document.createElement('div');
  if (card.hidden) {
    el.className = 'playing-card card-hidden';
    return el;
  }

  const isRed = card.color === 'red' || card.suit === '♥' || card.suit === '♦';
  el.className = `playing-card ${isRed ? 'color-red' : 'color-black'} ${isGodPeek ? 'god-peek-card' : ''}`;
  
  el.innerHTML = `
    <div class="card-top">
      <span>${card.label}</span>
      <span class="card-suit-small">${card.suit}</span>
    </div>
    <div class="card-center-suit">${card.suit}</div>
    <div class="card-bottom">
      <span>${card.label}</span>
      <span class="card-suit-small">${card.suit}</span>
    </div>
    ${isGodPeek ? '<span class="god-peek-badge">神の透視</span>' : ''}
  `;
  return el;
}

// コミュニティカード描画
function renderCommunityCards(cards) {
  dom.communityCardsRow.innerHTML = '';
  cards.forEach(card => {
    const cardEl = createCardElement(card, card.isGodPeek);
    dom.communityCardsRow.appendChild(cardEl);
  });
}

// 他プレイヤー描画
function renderOpponents(players) {
  dom.opponentsContainer.innerHTML = '';
  const opponents = players.filter(p => p.id !== socket.id);

  opponents.forEach(p => {
    const seat = document.createElement('div');
    seat.className = `opponent-seat ${p.isActive ? 'is-active-turn' : ''} ${p.folded ? 'is-folded' : ''}`;
    
    let cardsHtml = '<div class="opponent-mini-cards">';
    p.holeCards.forEach(c => {
      if (c.hidden) {
        cardsHtml += '<div class="playing-card card-hidden"></div>';
      } else {
        const isRed = c.color === 'red' || c.suit === '♥' || c.suit === '♦';
        cardsHtml += `<div class="playing-card mini-card-2row ${isRed ? 'color-red' : 'color-black'}">
          <span class="card-val-top">${c.label}</span>
          <span class="card-suit-bot">${c.suit}</span>
        </div>`;
      }
    });
    cardsHtml += '</div>';

    seat.innerHTML = `
      <div class="opponent-name">${p.isDealer ? '🔘 ' : ''}${escapeHtml(p.name)}</div>
      ${p.roleDef ? `<span class="tag-badge" style="background:${p.roleDef.color}; color:#000;">${p.roleDef.name.split(' ')[0]}</span>` : ''}
      ${cardsHtml}
      <div class="opponent-chips">$${p.chips.toLocaleString()}</div>
      ${p.currentBet > 0 ? `<div class="opponent-bet-chip">Bet: $${p.currentBet}</div>` : ''}
    `;
    dom.opponentsContainer.appendChild(seat);
  });
}

// 自身（下部ドック）描画
function renderSelfDock(gs) {
  const me = gs.players.find(p => p.id === socket.id);
  if (!me) return;

  if (gs.viewerRoleDef) {
    dom.myRoleIcon.textContent = gs.viewerRoleDef.icon;
    dom.myRoleName.textContent = gs.viewerRoleDef.name;
    dom.myRoleTeam.textContent = gs.viewerRoleDef.team === 'god' ? '神陣営' : (gs.viewerRoleDef.team === 'neutral' ? '第三勢力' : '村人陣営');
    dom.skillBadge.textContent = gs.viewerSkillUsesLeft;
  }

  if (dom.myChipsVal) {
    dom.myChipsVal.textContent = me.role === 'jobless' ? '無限' : `$${me.chips.toLocaleString()}`;
  }

  dom.myHoleCards.innerHTML = '';
  me.holeCards.forEach((c, idx) => {
    const cardEl = createCardElement(c, me.role === 'god');
    cardEl.addEventListener('click', () => {
      if (me.role === 'god' && me.skillUsesLeft > 0) {
        // 直接スキルモーダルを開く
        dom.btnUseSkill.click();
      }
    });
    dom.myHoleCards.appendChild(cardEl);
  });

  if (gs.myBestHand) {
    dom.myHandEval.textContent = `役: ${gs.myBestHand.handName}`;
  }

  const hasSkills = me.skillUsesLeft > 0;
  dom.btnUseSkill.disabled = !hasSkills || me.folded;
  dom.btnUseSkill.style.opacity = hasSkills && !me.folded ? '1' : '0.5';

  const cannotAccuse = me.folded || me.role === 'god' || me.role === 'joker' || me.role === 'onmyoji' || me.role === 'revolutionist' || me.accusationUsed;
  dom.btnOpenAccuse.disabled = cannotAccuse;
  dom.btnOpenAccuse.style.opacity = cannotAccuse ? '0.5' : '1';
  if (me.role === 'god' || me.role === 'joker') {
    dom.btnOpenAccuse.title = '神陣営の主役役職は告発できません';
  } else if (me.role === 'onmyoji') {
    dom.btnOpenAccuse.title = '☯️ 陰陽師は告発できません';
  } else if (me.role === 'revolutionist') {
    dom.btnOpenAccuse.title = '🚩 革命家は告発できません';
  } else if (me.accusationUsed) {
    dom.btnOpenAccuse.title = '🚨 告発は1ゲームに1回のみ行えます';
  } else if (me.folded) {
    dom.btnOpenAccuse.title = 'フォールドしたプレイヤーは告発できません';
  } else {
    dom.btnOpenAccuse.title = 'プレイヤーの正体を告発する';
  }

  const isMyTurn = me.isActive && !me.folded;
  const callAmount = gs.currentBet - me.currentBet;
  const isJobless = me.role === 'jobless';

  if (me.role === 'god' || me.role === 'joker') {
    dom.btnFold.disabled = true;
    dom.btnFold.title = '神陣営の主役役職はフォールドできません！';
    dom.btnFold.querySelector('.btn-main').textContent = 'FOLD (不可)';
  } else {
    dom.btnFold.disabled = !isMyTurn;
    dom.btnFold.title = '';
    dom.btnFold.querySelector('.btn-main').textContent = 'FOLD';
  }

  dom.btnCall.disabled = !isMyTurn;
  if (callAmount <= 0) {
    dom.callSubText.textContent = 'パス';
    dom.callMainText.textContent = 'CHECK';
  } else {
    dom.callSubText.textContent = isJobless ? 'ノーリスク' : `+$${callAmount}`;
    dom.callMainText.textContent = `CALL $${callAmount}`;
  }

  const minRaiseTotal = gs.currentBet + gs.minRaise;
  const maxAvailable = isJobless ? gs.currentBet + 500 : (me.chips + me.currentBet);
  
  dom.betSlider.min = minRaiseTotal;
  dom.betSlider.max = Math.max(minRaiseTotal, maxAvailable);
  dom.betSlider.value = Math.min(Number(dom.betSlider.value) || minRaiseTotal, maxAvailable);
  if (Number(dom.betSlider.value) < minRaiseTotal) dom.betSlider.value = minRaiseTotal;

  dom.raiseTargetVal.textContent = `$${dom.betSlider.value}`;
  dom.raiseMainText.textContent = `RAISE $${dom.betSlider.value}`;
  dom.btnRaise.disabled = !isMyTurn || (maxAvailable < minRaiseTotal && !isJobless);

  // 自分のターンの発光エフェクト & 音演出
  const bettingArea = document.querySelector('.betting-controls-area');
  const activeMyTurn = isMyTurn && gs.phase !== 'ended' && gs.phase !== 'showdown';

  if (activeMyTurn) {
    if (bettingArea) bettingArea.classList.add('my-turn-active');
    dom.btnFold.classList.add('turn-highlight');
    dom.btnCall.classList.add('turn-highlight');
    dom.btnRaise.classList.add('turn-highlight');

    if (!state.wasMyTurn) {
      window.soundManager.playTurnNotice();
    }
  } else {
    if (bettingArea) bettingArea.classList.remove('my-turn-active');
    dom.btnFold.classList.remove('turn-highlight');
    dom.btnCall.classList.remove('turn-highlight');
    dom.btnRaise.classList.remove('turn-highlight');
  }
  state.wasMyTurn = activeMyTurn;
}

// ログ描画
function renderLogs(logs) {
  dom.logMessages.innerHTML = '';
  logs.forEach(item => {
    const p = document.createElement('div');
    p.className = `log-entry ${item.type || 'info'}`;
    p.textContent = `[${item.time}] ${item.text}`;
    dom.logMessages.appendChild(p);
  });
  dom.logMessages.scrollTop = dom.logMessages.scrollHeight;
}

// ==========================================
// 3. プレイヤーアクション
// ==========================================

dom.btnFold.addEventListener('click', () => {
  socket.emit('player_action', { roomCode: state.roomCode, action: 'fold' });
  window.soundManager.playFold();
});

dom.btnCall.addEventListener('click', () => {
  const gs = state.gameState;
  if (!gs) return;
  const me = gs.players.find(p => p.id === socket.id);
  const callAmount = gs.currentBet - me.currentBet;
  
  if (callAmount <= 0) {
    socket.emit('player_action', { roomCode: state.roomCode, action: 'check' });
    window.soundManager.playCheck();
  } else {
    socket.emit('player_action', { roomCode: state.roomCode, action: 'call' });
    window.soundManager.playChip();
  }
});

dom.btnRaise.addEventListener('click', () => {
  const amount = Number(dom.betSlider.value);
  socket.emit('player_action', { roomCode: state.roomCode, action: 'raise', amount });
  window.soundManager.playChip();
});

dom.betSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  dom.raiseTargetVal.textContent = `$${val}`;
  dom.raiseMainText.textContent = `RAISE $${val}`;
});

document.querySelectorAll('.btn-chip-step').forEach(btn => {
  btn.addEventListener('click', () => {
    const step = btn.getAttribute('data-step');
    if (step) {
      dom.betSlider.value = Number(dom.betSlider.value) + Number(step);
      dom.betSlider.dispatchEvent(new Event('input'));
    }
  });
});
document.getElementById('btn-pot-raise').addEventListener('click', () => {
  if (state.gameState) {
    dom.betSlider.value = Math.max(Number(dom.betSlider.min), state.gameState.pot);
    dom.betSlider.dispatchEvent(new Event('input'));
  }
});
document.getElementById('btn-all-in').addEventListener('click', () => {
  dom.betSlider.value = dom.betSlider.max;
  dom.betSlider.dispatchEvent(new Event('input'));
});

// ==========================================
// 3.5. 自身の役職詳細モーダル (マイ役職ガイド)
// ==========================================

const CLIENT_ROLE_DEFINITIONS = {
  god: {
    id: 'god',
    name: '神 (God)',
    team: 'god',
    teamName: '神陣営',
    icon: '👑',
    color: '#fbbf24',
    badgeClass: 'role-god',
    description: '全知全能の存在。全プレイヤーの手札とコミュニティカード（未公開含む）が全て見える。フォールドおよび告発は行えない。',
    winCondition: 'ショーダウン時に自身の手役が最強であれば単独勝利！（※他者から神として告発された場合は敗北）',
    abilityDescription: '【神の改変】手札1枚、または未公開コミュニティカード1枚を山札の一番上と交換する（元のカードは山札の底へ送られる）。1ゲーム中に3回まで使用可能。',
    maxSkillUses: 3,
    passive: '全カード透視、フォールド不可、告発不可'
  },
  cultist: {
    id: 'cultist',
    name: '狂信者 (Cultist)',
    team: 'god',
    teamName: '神陣営',
    icon: '🩸',
    color: '#f87171',
    badgeClass: 'role-cultist',
    description: '神に忠誠を誓う信者。最初から誰が「神」か知っている。神が勝利した場合、神と共に勝利する。',
    winCondition: '「神」が勝利した時に共に勝利！',
    abilityDescription: '【狂信の献上】自分の手札の最強カード1枚と、神の手札の最弱カード1枚を強制交換する（1ゲームに1回）。',
    maxSkillUses: 1,
    passive: '神の正体を把握'
  },
  onmyoji: {
    id: 'onmyoji',
    name: '陰陽師 (Onmyoji)',
    team: 'neutral',
    teamName: '第三勢力',
    icon: '☯️',
    color: '#a78bfa',
    badgeClass: 'role-onmyoji',
    description: '神の力を狙う呪術師。最初から誰が「神」か知っている。自身がフォールドせず生き残った状態で神が勝利した場合、神の勝利を横取りして単独勝利！（※告発を行うことはできない）',
    winCondition: '自身がフォールドせず生存した状態で「神」が勝利した時、神の勝利を横取りして単独勝利！',
    abilityDescription: '【乗っ取り】神が勝利した時、自身が生きていれば勝利を奪う。（能力使用はなし。告発不可。他者から「神」または「陰陽師」として告発された場合、強制フォールドとなる）',
    maxSkillUses: 0,
    passive: '神の正体を把握、神勝利を乗っ取り、告発不可'
  },
  lovers: {
    id: 'lovers',
    name: '恋人 (Lovers)',
    team: 'lovers',
    teamName: '特殊陣営',
    icon: '💕',
    color: '#f472b6',
    badgeClass: 'role-lovers',
    description: '運命の相手と結ばれる者。ゲーム中、誰か1人を選んでペア（組）になる。',
    winCondition: '契約したペアと共に生き残り勝利（村人勝利時、ペア以外の村人は勝利不可＝恋人ペア勝利）。',
    abilityDescription: '【運命の契約】プレイヤー1名を選んでペアになる。村側勝利時、ペア以外の村人は勝利不可（恋人ペアの勝利）。神を選んだ場合、神が告発等で敗北したら恋人も道連れフォールド。',
    maxSkillUses: 1,
    passive: 'ペア成立時の運命共同体'
  },
  seer: {
    id: 'seer',
    name: '占い師 (Seer)',
    team: 'villager',
    teamName: '村人陣営',
    icon: '🔮',
    color: '#60a5fa',
    badgeClass: 'role-seer',
    description: '真実を見通す賢者。村人陣営の勝利のために神を暴き出す。',
    winCondition: '「神」を告発で暴き出す、または通常ポーカーで村人陣営として勝利。',
    abilityDescription: '【役職透視】指定したプレイヤー1名の役職を自分だけ確認する（1ゲームに1回）。',
    maxSkillUses: 1,
    passive: 'なし'
  },
  swindler: {
    id: 'swindler',
    name: '詐欺師 (Swindler)',
    team: 'villager',
    teamName: '村人陣営',
    icon: '🃏',
    color: '#34d399',
    badgeClass: 'role-swindler',
    description: '手札を自在に操るイカサマ師。劣勢の手札を覆す。',
    winCondition: '「神」を告発で暴き出す、または通常ポーカーで村人陣営として勝利。',
    abilityDescription: '【イカサマ引き直し】自分の手札を好きな枚数（1〜2枚）捨て、山札から新しく引き直す（1ゲームに1回）。',
    maxSkillUses: 1,
    passive: 'なし'
  },
  salesman: {
    id: 'salesman',
    name: '営業マン (Salesman)',
    team: 'villager',
    teamName: '村人陣営',
    icon: '💼',
    color: '#fb923c',
    badgeClass: 'role-salesman',
    description: '巧みな交渉で他人の手札を奪う商人。',
    winCondition: '「神」を告発で暴き出す、または通常ポーカーで村人陣営として勝利。',
    abilityDescription: '【押し売りトレード】指定したプレイヤー1名を選び、自分の手札の最弱カード1枚と相手の最強カード1枚を強制交換する（1ゲームに1回）。',
    maxSkillUses: 1,
    passive: 'なし'
  },
  jobless: {
    id: 'jobless',
    name: '無職 (Jobless)',
    team: 'villager',
    teamName: '村人陣営',
    icon: '🛋️',
    color: '#9ca3af',
    badgeClass: 'role-jobless',
    description: '失うもののない無敵の人。チップを一切消費せずにベット・コール・レイズ可能！',
    winCondition: '「神」を告発で暴く、または通常ポーカーで村人陣営勝利（※ただし勝利してもチップ獲得はゼロ）。',
    abilityDescription: '【ノーリスク参加】チップを一切賭けずにゲームに参加できる。（ただし勝利してもチップは一切得られない）',
    maxSkillUses: 0,
    passive: 'チップ消費ゼロ、チップ獲得なし'
  },
  jogress: {
    id: 'jogress',
    name: 'ジョグレス (Jogress)',
    team: 'villager',
    teamName: '村人陣営',
    icon: '🧬',
    color: '#38bdf8',
    badgeClass: 'role-jogress',
    description: '手札2枚を数値合成して強力なカードへと再構築する合体使い。',
    winCondition: '「神」を告発で暴き出す、または通常ポーカーで村人陣営として勝利。',
    abilityDescription: '【ジョグレス合成】手札2枚の数値を合体させる（Aは1扱い）。合計14以下なら合成カード1枚＋山札から1枚引く。合計15ならAペア作成。16以上はA＋余り数値のカードへ再構築する（1ゲーム1回）。',
    maxSkillUses: 1,
    passive: 'なし'
  },
  joker: {
    id: 'joker',
    name: 'ジョーカー (Joker)',
    team: 'god',
    teamName: '神陣営',
    icon: '🎭',
    color: '#ec4899',
    badgeClass: 'role-joker',
    description: '全スート・全数字として機能する最強の手札を持つ道化師。他者から「神告発」された場合は敗北する。また「フラッシュ」以上の手役でないと勝利できない。',
    winCondition: '「フラッシュ」以上の手役で最強であれば勝利！（※神告発された場合は敗北）',
    abilityDescription: '【ワイルド（パッシブ）】自分の手札2枚は全ての数字・すべてのスートとして機能する。ただし「フラッシュ」以上の手役でないと勝利できない。フォールドおよび告発は行えない。',
    maxSkillUses: 0,
    passive: '手札万能ワイルド、フォールド不可、告発不可、フラッシュ以上で勝利可能'
  },
  revolutionist: {
    id: 'revolutionist',
    name: '革命家 (Revolutionist)',
    team: 'neutral',
    teamName: '第三勢力',
    icon: '🚩',
    color: '#10b981',
    badgeClass: 'role-revolutionist',
    description: '世界の強弱法則を反転させる革命主導者。告発は行えない。能力を使用しない場合は村人勝利時に共に勝利する。',
    winCondition: '【能力未使用時】村人勝利時に共に勝利。【能力使用時】ジョーカー同卓時はジョーカーより強い手で勝利、ジョーカー不在時はツーペア以上で勝利！',
    abilityDescription: '【革命】使用したラウンドでは、(1)ポーカー役の強さ、または(2)トランプ数字の強さ、のどちらかを選んで強弱を逆転させる（1ゲームに1回）。告発不可。',
    maxSkillUses: 1,
    passive: '強弱法則の逆転、告発不可'
  }
};

function renderRoleSettingsPreview(roleSettings) {
  const container = document.getElementById('role-settings-icons-preview');
  const countText = document.getElementById('role-settings-count-text');
  if (!container) return;

  container.innerHTML = '';
  if (!roleSettings) return;

  const godRoles = roleSettings.enabledGodRoles || ['god', 'joker'];
  const otherRoles = roleSettings.enabledOtherRoles || [];
  const totalCount = godRoles.length + otherRoles.length;

  if (countText) {
    countText.textContent = `全${totalCount}役職 (神枠 ${godRoles.length}種 / 他 ${otherRoles.length}種)`;
  }

  // 神枠アイコン
  godRoles.forEach(rId => {
    const rDef = CLIENT_ROLE_DEFINITIONS[rId];
    if (rDef) {
      const badge = document.createElement('span');
      badge.className = `tag-badge ${rDef.badgeClass}`;
      badge.innerHTML = `${rDef.icon} ${rDef.name.split(' ')[0]}`;
      container.appendChild(badge);
    }
  });

  // その他アイコン
  otherRoles.forEach(rId => {
    const rDef = CLIENT_ROLE_DEFINITIONS[rId];
    if (rDef) {
      const badge = document.createElement('span');
      badge.className = `tag-badge ${rDef.badgeClass}`;
      badge.style.background = rDef.color;
      badge.style.color = '#000';
      badge.innerHTML = `${rDef.icon} ${rDef.name.split(' ')[0]}`;
      container.appendChild(badge);
    }
  });
}

function openMyRoleDetailModal() {
  const gs = state.gameState;
  const modalEl = document.getElementById('modal-my-role-detail');
  const body = document.getElementById('my-role-detail-body');
  if (!modalEl || !body) return;

  const me = (gs && gs.players) ? gs.players.find(p => p.id === socket.id) : null;
  const roleKey = (me && me.role) || (gs && gs.viewerRole) || (gs && gs.viewerRoleDef && gs.viewerRoleDef.id);

  if (!roleKey) {
    alert('ゲーム開始後に役職が配布されると、詳細を確認できます。');
    return;
  }

  const roleDef = (me && me.roleDef) || (gs && gs.viewerRoleDef) || CLIENT_ROLE_DEFINITIONS[roleKey];
  if (!roleDef) return;

  const teamBadgeClass = roleDef.badgeClass || 'role-god';
  const teamLabel = roleDef.teamName || (roleDef.team === 'god' ? '神陣営' : roleDef.team === 'neutral' ? '第三勢力' : roleDef.team === 'lovers' ? '特殊陣営' : '村人陣営');

  const maxUses = roleDef.maxSkillUses || 0;
  const usesLeft = (me && me.skillUsesLeft !== undefined) ? me.skillUsesLeft : ((gs && gs.viewerSkillUsesLeft !== undefined) ? gs.viewerSkillUsesLeft : maxUses);

  let abilitySectionHtml = '';
  if (roleDef.abilityDescription) {
    abilitySectionHtml = `
      <div class="role-detail-section role-detail-ability-box">
        <div class="role-detail-section-title">
          <span>⚡ 特殊能力 (Active Skill)</span>
          ${maxUses > 0 ? `<span class="role-uses-badge">残り ${usesLeft} / ${maxUses} 回</span>` : `<span class="role-uses-badge">常時/受動発動</span>`}
        </div>
        <div>${roleDef.abilityDescription}</div>
      </div>
    `;
  }

  let passiveSectionHtml = '';
  if (roleDef.passive && roleDef.passive !== 'なし') {
    passiveSectionHtml = `
      <div class="role-detail-section role-detail-passive-box">
        <div class="role-detail-section-title">
          <span>🛡️ 常時効果・制約 (Passive)</span>
        </div>
        <div>${roleDef.passive}</div>
      </div>
    `;
  }

  body.innerHTML = `
    <div class="role-detail-hero">
      <div class="role-detail-hero-icon">${roleDef.icon || '🎭'}</div>
      <div class="role-detail-hero-text">
        <h3 style="color:${roleDef.color || '#fff'};">${roleDef.name}</h3>
        <span class="badge ${teamBadgeClass}">${teamLabel}</span>
      </div>
    </div>

    <div class="role-detail-section role-detail-win-box">
      <div class="role-detail-section-title">
        <span>🏆 勝利条件 (Win Condition)</span>
      </div>
      <div><strong>${roleDef.winCondition || '通常ポーカーで最強の手役を揃えて勝利。'}</strong></div>
    </div>

    ${abilitySectionHtml}
    ${passiveSectionHtml}

    <div class="role-detail-section role-detail-desc-box">
      <div class="role-detail-section-title">
        <span>📖 役職の概要</span>
      </div>
      <div>${roleDef.description || ''}</div>
    </div>
  `;

  openModal(modalEl);
}

const roleBadgeEl = document.getElementById('my-role-badge-trigger');
if (roleBadgeEl) {
  roleBadgeEl.addEventListener('click', (e) => {
    e.preventDefault();
    openMyRoleDetailModal();
  });
}

// ==========================================
// 4. 特殊スキルモーダル
// ==========================================

dom.btnUseSkill.addEventListener('click', () => {
  const gs = state.gameState;
  if (!gs || !gs.viewerRoleDef) return;

  const content = document.getElementById('skill-modal-content');
  content.innerHTML = '';
  document.getElementById('skill-modal-title').textContent = `⚡ ${gs.viewerRoleDef.name} の能力`;

  const role = gs.viewerRole;
  state.selectedSkillParams = {};

  if (role === 'god') {
    const me = gs.players.find(p => p.id === socket.id);
    const visibleCount = gs.phase === 'flop' ? 3 : (gs.phase === 'turn' ? 4 : (gs.phase === 'river' || gs.phase === 'showdown' || gs.phase === 'ended' ? 5 : 0));

    let holeCardsHtml = '';
    if (me && me.holeCards) {
      me.holeCards.forEach((c, idx) => {
        const isRed = c.color === 'red' || c.suit === '♥' || c.suit === '♦';
        holeCardsHtml += `
          <button class="god-card-btn" data-type="hole" data-idx="${idx}">
            <div class="god-card-location">自分の手札 ${idx + 1}枚目</div>
            <div class="god-card-visual ${isRed ? 'color-red' : 'color-black'}">
              <span>${c.suit}</span>
              <span>${c.label}</span>
            </div>
            <div class="god-card-status">選択可能</div>
          </button>
        `;
      });
    }

    let communityCardsHtml = '';
    if (gs.communityCards) {
      gs.communityCards.forEach((c, idx) => {
        const isRevealed = idx < visibleCount;
        const isSelectable = !isRevealed;
        const isRed = c.color === 'red' || c.suit === '♥' || c.suit === '♦';

        communityCardsHtml += `
          <button class="god-card-btn ${isSelectable ? '' : 'disabled'}" data-type="community" data-idx="${idx}" ${isSelectable ? '' : 'disabled'}>
            <div class="god-card-location">場札 ${idx + 1}枚目 ${isRevealed ? '(表向き)' : '(未公開)'}</div>
            <div class="god-card-visual ${isRed ? 'color-red' : 'color-black'}">
              ${c.hidden ? '<span style="font-size:1rem;">❓</span>' : `<span>${c.suit}</span><span>${c.label}</span>`}
            </div>
            <div class="god-card-status">${isSelectable ? '選択可能' : '公開済み'}</div>
          </button>
        `;
      });
    }

    content.innerHTML = `
      <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:0.75rem;">
        交換したいカード（手札または未公開場札）を選択してください：
      </p>

      <div style="margin-bottom:1rem;">
        <div style="font-size:0.85rem; color:var(--gold-400); font-weight:bold; margin-bottom:0.4rem;">
          🃏 自分の手札
        </div>
        <div class="god-card-picker-grid">
          ${holeCardsHtml}
        </div>
      </div>

      <div>
        <div style="font-size:0.85rem; color:var(--gold-400); font-weight:bold; margin-bottom:0.4rem;">
          🎴 コミュニティカード (未公開の場札のみ改変可能)
        </div>
        <div class="god-card-picker-grid">
          ${communityCardsHtml}
        </div>
      </div>
    `;

    content.querySelectorAll('.god-card-btn:not(.disabled)').forEach(b => {
      b.addEventListener('click', () => {
        content.querySelectorAll('.god-card-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        state.selectedSkillParams = {
          skillType: 'god_alteration',
          params: { targetType: b.dataset.type, targetIndex: Number(b.dataset.idx) }
        };
      });
    });
  } else if (role === 'seer' || role === 'lovers') {
    content.innerHTML = `<p>対象とするプレイヤーを選択してください：</p><div class="target-player-select-grid" style="margin-top:1rem;"></div>`;
    const grid = content.querySelector('.target-player-select-grid');
    gs.players.filter(p => p.id !== socket.id).forEach(p => {
      const b = document.createElement('button');
      b.className = 'target-btn';
      b.textContent = p.name;
      b.addEventListener('click', () => {
        grid.querySelectorAll('.target-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        state.selectedSkillParams = {
          skillType: role === 'seer' ? 'seer_inspect' : 'lovers_contract',
          params: { targetPlayerId: p.id }
        };
      });
      grid.appendChild(b);
    });
  } else if (role === 'swindler') {
    content.innerHTML = `
      <p>引き直す手札を選択してください：</p>
      <div class="target-player-select-grid" style="margin-top:1rem;">
        <button class="target-btn" data-idx="0">1枚目を引き直す</button>
        <button class="target-btn" data-idx="1">2枚目を引き直す</button>
        <button class="target-btn" data-idx="all">両方とも引き直す</button>
      </div>
    `;
    content.querySelectorAll('.target-btn').forEach(b => {
      b.addEventListener('click', () => {
        content.querySelectorAll('.target-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        const idx = b.dataset.idx;
        const indices = idx === 'all' ? [0, 1] : [Number(idx)];
        state.selectedSkillParams = {
          skillType: 'swindler_redraw',
          params: { discardIndices: indices }
        };
      });
    });
  } else if (role === 'cultist') {
    content.innerHTML = `<p><strong>🩸 狂信の献上</strong><br>👑 神へ自分の最強カードを献上し、神の最弱カードと交換します。<br><small style="color:var(--text-secondary);">※確定ボタンを押すと自動的にあなたの最高カードと神の最弱カードが交換されます。</small></p>`;
    state.selectedSkillParams = {
      skillType: 'cultist_swap',
      params: {}
    };
  } else if (role === 'salesman') {
    content.innerHTML = `<p><strong>💼 押し売りトレード</strong><br>対象プレイヤーを選択してください：<br><small style="color:var(--text-secondary);">自分の最弱カードと、相手の最強カードを強制交換します。</small></p><div class="target-player-select-grid" style="margin-top:1rem;"></div>`;
    const grid = content.querySelector('.target-player-select-grid');
    gs.players.filter(p => p.id !== socket.id).forEach(p => {
      const b = document.createElement('button');
      b.className = 'target-btn';
      b.textContent = p.name;
      b.addEventListener('click', () => {
        grid.querySelectorAll('.target-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        state.selectedSkillParams = {
          skillType: 'salesman_trade',
          params: { targetPlayerId: p.id }
        };
      });
      grid.appendChild(b);
    });
  } else if (role === 'jogress') {
    content.innerHTML = `<p><strong>🧬 ジョグレス合成</strong><br>手札2枚の数値を合体させ強力なカードに再構築します。<br><small style="color:var(--text-secondary);">※能力を発動すると手札が自動合成されます。（合計14以下: 1枚合成＋1枚引く / 合計15: Aのペア / 16以上: A＋余りカード）</small></p>`;
    state.selectedSkillParams = {
      skillType: 'jogress_fusion',
      params: {}
    };
  } else if (role === 'revolutionist') {
    content.innerHTML = `
      <p><strong>🚩 革命（強弱逆転）</strong><br>逆転させる法則を選択してください：</p>
      <div class="target-player-select-grid" style="margin-top:1rem;">
        <button class="target-btn" data-type="handRank" style="padding:0.75rem; text-align:left;">
          <div style="font-weight:bold; font-size:0.95rem;">🔄 (1) ポーカー役の強さを逆転</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.2rem;">
            ハイカードが最強、ロイヤルストレートフラッシュが最弱になります。
          </div>
        </button>
        <button class="target-btn" data-type="cardValue" style="padding:0.75rem; text-align:left;">
          <div style="font-weight:bold; font-size:0.95rem;">🔄 (2) トランプ数字の強さを逆転</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.2rem;">
            ２が最強、エース(A)が最弱になります。
          </div>
        </button>
      </div>
    `;
    content.querySelectorAll('.target-btn').forEach(b => {
      b.addEventListener('click', () => {
        content.querySelectorAll('.target-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        state.selectedSkillParams = {
          skillType: 'revolution_ability',
          params: { reverseType: b.dataset.type }
        };
      });
    });
  }

  openModal(dom.modals.skill);
});

// スキル発動確定
document.getElementById('btn-confirm-skill').addEventListener('click', () => {
  if (!state.selectedSkillParams.skillType) {
    alert('対象を選択してください');
    return;
  }
  socket.emit('use_skill', {
    roomCode: state.roomCode,
    skillType: state.selectedSkillParams.skillType,
    params: state.selectedSkillParams.params
  }, (res) => {
    if (res.success) {
      window.soundManager.playSkill();
      closeModal(dom.modals.skill);
      if (res.result && res.result.role) {
        alert(`🔮 占いの結果：${res.result.targetName} の役職は【${res.result.role}】でした！`);
      }
    } else {
      alert(res.message);
    }
  });
});

// ==========================================
// 5. 告発モーダル
// ==========================================

dom.btnOpenAccuse.addEventListener('click', () => {
  const gs = state.gameState;
  if (!gs) return;

  const me = gs.players.find(p => p.id === socket.id);
  if (!me) return;
  if (me.role === 'god') {
    alert('👑 神は告発を行うことができません。');
    return;
  }
  if (me.role === 'onmyoji') {
    alert('☯️ 陰陽師は告発を行うことができません。');
    return;
  }
  if (me.folded) {
    alert('フォールドしたプレイヤーは告発できません。');
    return;
  }

  state.selectedAccuseTarget = null;
  state.selectedAccuseType = 'god';

  // ラジオボタンのリセット
  const radioGod = document.getElementById('label-accuse-god');
  const radioOnmyoji = document.getElementById('label-accuse-onmyoji');
  if (radioGod && radioOnmyoji) {
    radioGod.classList.add('active');
    radioOnmyoji.classList.remove('active');
    radioGod.querySelector('input').checked = true;
  }

  const grid = document.getElementById('accuse-targets-grid');
  grid.innerHTML = '';

  const candidates = gs.players.filter(p => p.id !== socket.id && !p.folded);
  if (candidates.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);">告発可能な生存プレイヤーがいません。</p>';
  } else {
    candidates.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'target-btn';
      btn.textContent = p.name;
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.target-btn').forEach(x => x.classList.remove('selected'));
        btn.classList.add('selected');
        state.selectedAccuseTarget = p.id;
      });
      grid.appendChild(btn);
    });
  }

  openModal(dom.modals.accuse);
});

document.querySelectorAll('input[name="accuse-type"]').forEach(r => {
  r.addEventListener('change', (e) => {
    state.selectedAccuseType = e.target.value;
    document.querySelectorAll('.radio-label').forEach(l => l.classList.remove('active'));
    e.target.closest('.radio-label').classList.add('active');
  });
});

// 告発実行（confirmダイアログ完全撤廃・即座実行）
document.getElementById('btn-confirm-accuse').addEventListener('click', () => {
  if (!state.selectedAccuseTarget) {
    alert('告発する対象プレイヤーを選択してください！');
    return;
  }

  window.soundManager.playAccuse();
  socket.emit('accuse_player', {
    roomCode: state.roomCode,
    targetPlayerId: state.selectedAccuseTarget,
    accuseType: state.selectedAccuseType || 'god'
  }, (res) => {
    closeModal(dom.modals.accuse);
    if (!res.success && res.message) {
      alert(res.message);
    }
  });
});

// ==========================================
// 6. ラウンドリザルト & 最終総合結果
// ==========================================

function renderResultModal(info, isMatchOver = false) {
  window.soundManager.playWin();

  const title = document.getElementById('result-title');
  const badge = document.getElementById('result-team-badge');
  const reason = document.getElementById('result-reason');
  const potVal = document.getElementById('result-pot-val');
  const grid = document.getElementById('result-showdown-grid');
  const myCardContainer = document.getElementById('my-round-result-card');

  // 自分の個別結果 & チップ変動表示
  if (myCardContainer) {
    const myResult = info.playerResults ? info.playerResults.find(p => p.id === socket.id) : null;
    const isWinner = info.winners.some(w => w.id === socket.id);
    const myPlayer = state.gameState?.players?.find(p => p.id === socket.id);

    if (myResult || myPlayer) {
      const start = myResult ? myResult.startChips : myPlayer.chips;
      const end = myResult ? myResult.endChips : myPlayer.chips;
      const net = myResult ? myResult.netChange : (end - start);
      const isFolded = myResult ? myResult.folded : myPlayer.folded;

      let resultClass = 'result-lose';
      let resultTitle = '💔 ラウンド敗北';
      let resultIcon = '💸';

      if (isWinner) {
        resultClass = 'result-win';
        resultTitle = '🎉 あなたの勝利！';
        resultIcon = '🏆';
      } else if (isFolded) {
        resultClass = 'result-fold';
        resultTitle = '🏳️ フォールド (降り)';
        resultIcon = '🚪';
      }

      let netBadgeClass = 'chip-net-even';
      let netStr = '$0';
      if (net > 0) {
        netBadgeClass = 'chip-net-plus';
        netStr = `+ $${net.toLocaleString()}`;
      } else if (net < 0) {
        netBadgeClass = 'chip-net-minus';
        netStr = `- $${Math.abs(net).toLocaleString()}`;
      }

      myCardContainer.className = `my-round-result-card ${resultClass}`;
      myCardContainer.innerHTML = `
        <div class="my-result-header">
          <span>${resultIcon}</span>
          <span>${resultTitle}</span>
        </div>
        <div class="my-result-chip-flow">
          <span>所持チップ: <strong>$${start.toLocaleString()}</strong></span>
          <span class="chip-arrow">➔</span>
          <span><strong>$${end.toLocaleString()}</strong></span>
          <span class="chip-net-badge ${netBadgeClass}">${netStr}</span>
        </div>
      `;
    }
  }

  potVal.textContent = `$${info.pot.toLocaleString()}`;
  reason.textContent = info.specialWinReason || `${info.winningHandName} で勝利`;

  if (info.winningTeam === 'god') {
    badge.textContent = 'GOD WIN';
    badge.style.background = 'var(--gold-500)';
    title.textContent = '👑 神陣営の完全勝利！';
  } else if (info.winningTeam === 'neutral') {
    badge.textContent = 'ONMYOJI HIJACK WIN';
    badge.style.background = 'var(--accent-purple)';
    title.textContent = '☯️ 陰陽師の乗っ取り単独勝利！！';
  } else if (info.winningTeam === 'lovers') {
    badge.textContent = 'LOVERS WIN';
    badge.style.background = 'var(--accent-pink)';
    title.textContent = '💕 恋人ペアの勝利！！';
  } else {
    badge.textContent = 'VILLAGER WIN';
    badge.style.background = 'var(--accent-blue)';
    title.textContent = '🏆 村人陣営の勝利！';
  }

  grid.innerHTML = '';
  info.showdownHands.forEach(p => {
    const isWinner = info.winners.some(w => w.id === p.id);
    const card = document.createElement('div');
    card.className = `showdown-player-card ${isWinner ? 'is-winner' : ''}`;
    
    let cardsHtml = '<div class="sp-cards">';
    p.cards.forEach(c => {
      const isRed = c.color === 'red' || c.suit === '♥' || c.suit === '♦';
      cardsHtml += `<div class="playing-card mini-card-2row ${isRed ? 'color-red' : 'color-black'}">
        <span class="card-val-top">${c.label}</span>
        <span class="card-suit-bot">${c.suit}</span>
      </div>`;
    });
    cardsHtml += '</div>';

    card.innerHTML = `
      <div class="sp-header">
        <span>${escapeHtml(p.name)}</span>
        <span style="color:var(--gold-400);">${p.role ? p.role.toUpperCase() : ''}</span>
      </div>
      ${cardsHtml}
      <div class="sp-hand-name">${p.handName}</div>
    `;
    grid.appendChild(card);
  });

  const btnNext = document.getElementById('btn-next-round');
  const btnFinal = dom.btnViewFinalResult;
  const guestWait = dom.guestResultWaitMsg;

  if (isMatchOver) {
    btnNext.style.display = 'none';
    btnFinal.style.display = 'block';
    if (guestWait) guestWait.style.display = 'none';
  } else {
    btnFinal.style.display = 'none';
    if (state.isHost) {
      btnNext.style.display = 'block';
      if (guestWait) guestWait.style.display = 'none';
    } else {
      btnNext.style.display = 'none';
      if (guestWait) guestWait.style.display = 'block';
    }
  }

  openModal(dom.modals.result);
}

// 最終総合結果モーダルの描画
function renderFinalResultModal(results) {
  closeModal(dom.modals.result);
  window.soundManager.playWin();

  dom.finalResultReason.textContent = results.reason;
  dom.finalWinnerName.textContent = results.winner ? results.winner.name : '勝者なし';
  dom.finalWinnerChips.textContent = results.winner ? `$${results.winner.chips.toLocaleString()}` : '$0';

  dom.finalRankingList.innerHTML = '';
  if (results.rankings) {
    results.rankings.forEach(item => {
      const row = document.createElement('div');
      row.className = `ranking-row rank-${item.rank}`;
      row.innerHTML = `
        <div class="rank-left">
          <div class="rank-num-badge">${item.rank}</div>
          <div class="rank-player-name">${escapeHtml(item.name)} ${item.isBot ? '<small class="tag-badge tag-bot">CPU</small>' : ''}</div>
        </div>
        <div class="rank-player-chips">$${item.chips.toLocaleString()}</div>
      `;
      dom.finalRankingList.appendChild(row);
    });
  }

  dom.btnReturnLobby.style.display = 'block';
  openModal(dom.modals.finalResult);
}

// 次のラウンド開始
document.getElementById('btn-next-round').addEventListener('click', () => {
  closeModal(dom.modals.result);
  socket.emit('start_game', { roomCode: state.roomCode });
});

// 最終結果を見るボタン
dom.btnViewFinalResult.addEventListener('click', () => {
  if (state.gameState && state.gameState.finalMatchResults) {
    renderFinalResultModal(state.gameState.finalMatchResults);
  }
});

// ユーティリティ
function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

// ==========================================
// 6. 役職カスタマイズモーダル (Ban/Pick)
// ==========================================

const btnOpenRoleSettings = document.getElementById('btn-open-role-settings');
if (btnOpenRoleSettings) {
  btnOpenRoleSettings.addEventListener('click', () => {
    const gs = state.gameState;
    const currentSettings = (gs && gs.roleSettings) ? gs.roleSettings : {
      enabledGodRoles: ['god', 'joker'],
      enabledOtherRoles: ['cultist', 'onmyoji', 'lovers', 'seer', 'swindler', 'salesman', 'jobless', 'jogress']
    };

    const enabledGod = currentSettings.enabledGodRoles || ['god', 'joker'];
    const enabledOther = currentSettings.enabledOtherRoles || [];

    document.getElementById('setting-role-god').checked = enabledGod.includes('god');
    document.getElementById('setting-role-joker').checked = enabledGod.includes('joker');

    document.querySelectorAll('.setting-other-role').forEach(cb => {
      cb.checked = enabledOther.includes(cb.value);
    });

    openModal(dom.modals.roleSettings);
  });
}

const btnSaveRoleSettings = document.getElementById('btn-save-role-settings');
if (btnSaveRoleSettings) {
  btnSaveRoleSettings.addEventListener('click', () => {
    const enabledGodRoles = [];
    if (document.getElementById('setting-role-god').checked) enabledGodRoles.push('god');
    if (document.getElementById('setting-role-joker').checked) enabledGodRoles.push('joker');

    if (enabledGodRoles.length === 0) {
      alert('👑 神枠役職（神またはジョーカー）は最低1つ選択する必要があります！');
      return;
    }

    const enabledOtherRoles = [];
    document.querySelectorAll('.setting-other-role:checked').forEach(cb => {
      enabledOtherRoles.push(cb.value);
    });

    socket.emit('update_role_settings', {
      roomCode: state.roomCode,
      roleSettings: {
        enabledGodRoles,
        enabledOtherRoles
      }
    }, (res) => {
      if (res.success) {
        closeModal(dom.modals.roleSettings);
      } else {
        alert(res.message || '役職設定の更新に失敗しました');
      }
    });
  });
}

const btnRoleSelectAll = document.getElementById('btn-role-select-all');
if (btnRoleSelectAll) {
  btnRoleSelectAll.addEventListener('click', () => {
    document.querySelectorAll('.setting-other-role').forEach(cb => cb.checked = true);
  });
}

const btnRoleResetDefault = document.getElementById('btn-role-reset-default');
if (btnRoleResetDefault) {
  btnRoleResetDefault.addEventListener('click', () => {
    document.getElementById('setting-role-god').checked = true;
    document.getElementById('setting-role-joker').checked = true;
    document.querySelectorAll('.setting-other-role').forEach(cb => cb.checked = true);
  });
}
