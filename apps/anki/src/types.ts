export interface Deck {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  note: string;
  tags: string;
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReviewGrade = "again" | "hard" | "good" | "easy";

export interface Review {
  id: string;
  cardId: string;
  grade: ReviewGrade;
  reviewedAt: string;
  nextDueAt: string;
  intervalDays: number;
  easeFactor: number;
}

export interface Overview {
  decks: Deck[];
  cardCounts: Array<{ deckId: string; total: number }>;
  dueCards: Card[];
  recentReviews: Review[];
  serverTime: string;
}
