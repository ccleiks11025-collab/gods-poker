// engine/roles.js - 役職定義と特殊スキル管理

export const ROLE_DEFINITIONS = {
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

export const GOD_LEAD_ROLES = ['god', 'joker'];

export function isGodLeadRole(roleId) {
  return GOD_LEAD_ROLES.includes(roleId);
}

const OTHER_ROLE_IDS = [
  'cultist',
  'onmyoji',
  'lovers',
  'seer',
  'swindler',
  'salesman',
  'jobless',
  'jogress',
  'revolutionist'
];

// 参加プレイヤー（2〜8人）に役職をランダム配分
export function assignRoles(playerIds, customRoleSettings = {}) {
  const count = playerIds.length;
  if (count < 2 || count > 8) {
    throw new Error('プレイヤー人数は2名〜8名である必要があります');
  }

  // 有効な神枠候補プール
  let godPool = customRoleSettings.enabledGodRoles && customRoleSettings.enabledGodRoles.length > 0
    ? customRoleSettings.enabledGodRoles.filter(r => GOD_LEAD_ROLES.includes(r))
    : GOD_LEAD_ROLES;
  if (godPool.length === 0) godPool = GOD_LEAD_ROLES;

  // 有効なその他役職候補プール
  let otherPool = customRoleSettings.enabledOtherRoles && customRoleSettings.enabledOtherRoles.length > 0
    ? customRoleSettings.enabledOtherRoles.filter(r => OTHER_ROLE_IDS.includes(r))
    : [...OTHER_ROLE_IDS];
  if (otherPool.length === 0) otherPool = [...OTHER_ROLE_IDS];

  // シャッフル
  const shuffledGodPool = [...godPool].sort(() => Math.random() - 0.5);
  const shuffledOtherPool = [...otherPool].sort(() => Math.random() - 0.5);

  // プレイヤー人数に対して役職候補が足りない場合は jobless で補填
  while (shuffledOtherPool.length < count - 1) {
    shuffledOtherPool.push('jobless');
  }

  // 1. シャッフルしたプレイヤー一覧
  const shuffledPlayers = [...playerIds].sort(() => Math.random() - 0.5);
  
  // 2. 最初のプレイヤーに神枠役職を確定付与
  const godPlayerId = shuffledPlayers[0];
  const selectedGodRole = shuffledGodPool[0];
  const roleAssignments = {
    [godPlayerId]: selectedGodRole
  };

  // 3. 残りのプレイヤーに他の役職プールから配分
  for (let i = 1; i < shuffledPlayers.length; i++) {
    const pId = shuffledPlayers[i];
    roleAssignments[pId] = shuffledOtherPool[i - 1];
  }

  return roleAssignments;
}
