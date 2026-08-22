// engine/handEvaluator.js - ポーカー手役判定エンジン (7枚から最善の5枚を選出して評価)

export const HAND_NAMES = {
  10: 'ロイヤルストレートフラッシュ (Royal Flush)',
  9: 'ファイブカード (Five of a Kind)',
  8: 'ストレートフラッシュ (Straight Flush)',
  7: 'フォーカード (Four of a Kind)',
  6: 'フルハウス (Full House)',
  5: 'フラッシュ (Flush)',
  4: 'ストレート (Straight)',
  3: 'スリーカード (Three of a Kind)',
  2: 'ツーペア (Two Pair)',
  1: 'ワンペア (One Pair)',
  0: 'ハイカード (High Card)'
};

// 7枚から5枚を選ぶ全21通りの組み合わせを生成
function get5CardCombinations(cards) {
  const result = [];
  const n = cards.length;
  if (n < 5) return [cards]; // 5枚未満の場合はそのまま
  
  function combine(start, combo) {
    if (combo.length === 5) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(cards[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }
  combine(0, []);
  return result;
}

// 5枚のカードの役を評価する
export function evaluate5Cards(cards, options = {}) {
  // 数字逆転オプション
  const reverseCardValue = !!(options.reverseCardValue || options.cardValue);

  // 評価用カード作成（数字逆転時は 2->14, 3->13, ..., 14(A)->2 に変換）
  const evalCards = cards.map(c => ({
    ...c,
    value: reverseCardValue ? (16 - c.value) : c.value
  }));

  // ランク値の降順にソート
  const sortedEval = [...evalCards].sort((a, b) => b.value - a.value);
  const values = sortedEval.map(c => c.value);
  const suits = sortedEval.map(c => c.suit);

  // 表示用オリジナルカードのソート
  const sortedOriginal = [...cards].sort((a, b) => {
    const valA = reverseCardValue ? (16 - a.value) : a.value;
    const valB = reverseCardValue ? (16 - b.value) : b.value;
    return valB - valA;
  });

  // フラッシュ判定（5枚とも同じスート）
  const isFlush = suits.every(s => s === suits[0]);

  // ストレート判定
  let isStraight = false;
  let straightHigh = 0;

  // 通常ストレート (例: 14, 13, 12, 11, 10 または 9, 8, 7, 6, 5)
  if (
    values[0] - values[1] === 1 &&
    values[1] - values[2] === 1 &&
    values[2] - values[3] === 1 &&
    values[3] - values[4] === 1
  ) {
    isStraight = true;
    straightHigh = values[0];
  } else if (
    // A-2-3-4-5 (Wheel Straight)
    values[0] === 14 &&
    values[1] === 5 &&
    values[2] === 4 &&
    values[3] === 3 &&
    values[4] === 2
  ) {
    isStraight = true;
    straightHigh = 5; // A-5ストレートのハイカードは5
  }

  // ロイヤルストレートフラッシュ (ランク10)
  if (isFlush && isStraight && straightHigh === 14) {
    return {
      rank: 10,
      score: [10, 14],
      handName: HAND_NAMES[10],
      cards: sortedOriginal
    };
  }

  // ランク毎の枚数をカウント
  const counts = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }
  // 出現頻度順、同数ならランク降順で並べ替え
  const countPairs = Object.entries(counts)
    .map(([val, cnt]) => ({ value: Number(val), count: cnt }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  // ファイブカード (ランク9) - 5枚すべて同じ数値
  if (countPairs[0].count === 5) {
    return {
      rank: 9,
      score: [9, countPairs[0].value],
      handName: HAND_NAMES[9],
      cards: sortedOriginal
    };
  }

  // ストレートフラッシュ (ランク8)
  if (isFlush && isStraight) {
    return {
      rank: 8,
      score: [8, straightHigh],
      handName: HAND_NAMES[8],
      cards: sortedOriginal
    };
  }

  // フォーカード
  if (countPairs[0].count === 4) {
    return {
      rank: 7,
      score: [7, countPairs[0].value, countPairs[1].value],
      handName: HAND_NAMES[7],
      cards: sortedOriginal
    };
  }

  // フルハウス
  if (countPairs[0].count === 3 && countPairs[1].count === 2) {
    return {
      rank: 6,
      score: [6, countPairs[0].value, countPairs[1].value],
      handName: HAND_NAMES[6],
      cards: sortedOriginal
    };
  }

  // フラッシュ
  if (isFlush) {
    return {
      rank: 5,
      score: [5, ...values],
      handName: HAND_NAMES[5],
      cards: sortedOriginal
    };
  }

  // ストレート
  if (isStraight) {
    return {
      rank: 4,
      score: [4, straightHigh],
      handName: HAND_NAMES[4],
      cards: sortedOriginal
    };
  }

  // スリーカード
  if (countPairs[0].count === 3) {
    const kickers = countPairs.slice(1).map(p => p.value);
    return {
      rank: 3,
      score: [3, countPairs[0].value, ...kickers],
      handName: HAND_NAMES[3],
      cards: sortedOriginal
    };
  }

  // ツーペア
  if (countPairs[0].count === 2 && countPairs[1].count === 2) {
    return {
      rank: 2,
      score: [2, countPairs[0].value, countPairs[1].value, countPairs[2].value],
      handName: HAND_NAMES[2],
      cards: sortedOriginal
    };
  }

  // ワンペア
  if (countPairs[0].count === 2) {
    const kickers = countPairs.slice(1).map(p => p.value);
    return {
      rank: 1,
      score: [1, countPairs[0].value, ...kickers],
      handName: HAND_NAMES[1],
      cards: sortedOriginal
    };
  }

  // ハイカード
  return {
    rank: 0,
    score: [0, ...values],
    handName: HAND_NAMES[0],
    cards: sortedOriginal
  };
}

// 2つの役スコアを比較 (a > b: 1, a < b: -1, a == b: 0)
export function compareScores(scoreA, scoreB, options = {}) {
  const reverseHandRank = !!(options.reverseHandRank || options.handRank);
  const len = Math.min(scoreA.length, scoreB.length);

  for (let i = 0; i < len; i++) {
    if (i === 0 && reverseHandRank) {
      // 役ランク逆転時: ランクが小さいほど強い (ハイカード=0 が最上位)
      if (scoreA[0] < scoreB[0]) return 1;
      if (scoreA[0] > scoreB[0]) return -1;
    } else {
      if (scoreA[i] > scoreB[i]) return 1;
      if (scoreA[i] < scoreB[i]) return -1;
    }
  }
  return 0;
}

// ジョーカー（ワイルド2枚）専用の手役探索処理
export function evaluateJokerBestHand(communityCards = [], options = {}) {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const evalOptions = { reverseCardValue: options.reverseCardValue };

  // 全52枚のデッキカード定義を生成
  const deck = [];
  for (const suit of suits) {
    for (const val of values) {
      deck.push({ suit, value: val });
    }
  }

  let best = null;
  let fallbackBest = null;

  // 全ワイルドペア（2枚）の全探索
  for (let i = 0; i < deck.length; i++) {
    for (let j = i; j < deck.length; j++) {
      const wildPair = [deck[i], deck[j]];
      const res = evaluateBestHand(wildPair, communityCards, false, evalOptions);
      
      // ジョーカーは「フラッシュ(rank 5)」以上の手役のみ選択
      if (res.rank >= 5) {
        if (!best || compareScores(res.score, best.score, evalOptions) > 0) {
          best = res;
        }
      }
      if (!fallbackBest || compareScores(res.score, fallbackBest.score, evalOptions) > 0) {
        fallbackBest = res;
      }
    }
  }

  return best || fallbackBest;
}

// 手札2枚 + コミュニティカード(最大5枚)から最善の役を判定
export function evaluateBestHand(holeCards, communityCards = [], isJoker = false, options = {}) {
  if (isJoker) {
    return evaluateJokerBestHand(communityCards, options);
  }

  const allCards = [...holeCards, ...communityCards];
  const reverseCardValue = !!options.reverseCardValue;
  const evalOptions = { reverseCardValue };

  if (allCards.length < 5) {
    // 5枚未満の場合はそのまま簡易評価
    const sorted = [...allCards].sort((a, b) => {
      const valA = reverseCardValue ? (16 - a.value) : a.value;
      const valB = reverseCardValue ? (16 - b.value) : b.value;
      return valB - valA;
    });
    return {
      rank: 0,
      score: [0, ...sorted.map(c => reverseCardValue ? (16 - c.value) : c.value)],
      handName: '未確定',
      cards: sorted
    };
  }

  const combos = get5CardCombinations(allCards);
  let best = null;

  for (const combo of combos) {
    const evaluated = evaluate5Cards(combo, evalOptions);
    if (!best || compareScores(evaluated.score, best.score, evalOptions) > 0) {
      best = evaluated;
    }
  }

  return best;
}
