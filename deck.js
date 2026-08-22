// engine/deck.js - トランプデッキおよび山札管理

export const SUITS = [
  { symbol: '♠', name: 'spades', color: 'black' },
  { symbol: '♥', name: 'hearts', color: 'red' },
  { symbol: '♦', name: 'diamonds', color: 'red' },
  { symbol: '♣', name: 'clubs', color: 'black' }
];

export const RANKS = [
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6' },
  { value: 7, label: '7' },
  { value: 8, label: '8' },
  { value: 9, label: '9' },
  { value: 10, label: '10' },
  { value: 11, label: 'J' },
  { value: 12, label: 'Q' },
  { value: 13, label: 'K' },
  { value: 14, label: 'A' }
];

export class Card {
  constructor(suit, rank) {
    this.suit = suit.symbol; // '♠', '♥', '♦', '♣'
    this.suitName = suit.name;
    this.color = suit.color;
    this.value = rank.value; // 2..14
    this.label = rank.label; // '2'..'A'
    this.id = `${suit.symbol}${rank.label}`;
  }

  toString() {
    return `${this.suit}${this.label}`;
  }
}

export class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push(new Card(suit, rank));
      }
    }
    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw(count = 1) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (this.cards.length > 0) {
        drawn.push(this.cards.shift());
      }
    }
    return count === 1 ? drawn[0] : drawn;
  }

  // 神の能力：手札や未公開コミュニティカードを山札一番上と交換し、元のカードを山札の底へ送る
  swapWithTop(oldCard) {
    if (this.cards.length === 0) return null;
    const newCard = this.cards.shift(); // 山札の一番上を引く
    this.cards.push(oldCard); // 元のカードを山札の一番下に送る
    return newCard;
  }

  remainingCount() {
    return this.cards.length;
  }
}
