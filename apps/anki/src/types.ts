import { array, boolean, number, object, picklist, string, type InferOutput } from "valibot";

export const ReviewGradeSchema = picklist(["again", "hard", "good", "easy"]);
export type ReviewGrade = InferOutput<typeof ReviewGradeSchema>;

export const DeckSchema = object({
  id: string(),
  name: string(),
  description: string(),
  color: string(),
  createdAt: string(),
  updatedAt: string(),
});
export type Deck = InferOutput<typeof DeckSchema>;

export const CardSchema = object({
  id: string(),
  deckId: string(),
  front: string(),
  back: string(),
  note: string(),
  tags: string(),
  dueAt: string(),
  intervalDays: number(),
  easeFactor: number(),
  repetitions: number(),
  lapses: number(),
  suspended: boolean(),
  createdAt: string(),
  updatedAt: string(),
});
export type Card = InferOutput<typeof CardSchema>;

export const ReviewSchema = object({
  id: string(),
  cardId: string(),
  grade: ReviewGradeSchema,
  reviewedAt: string(),
  nextDueAt: string(),
  intervalDays: number(),
  easeFactor: number(),
});
export type Review = InferOutput<typeof ReviewSchema>;

export const OverviewSchema = object({
  decks: array(DeckSchema),
  cardCounts: array(object({ deckId: string(), total: number() })),
  dueCards: array(CardSchema),
  recentReviews: array(ReviewSchema),
  serverTime: string(),
});
export type Overview = InferOutput<typeof OverviewSchema>;

export const CreatedSchema = object({ id: string() });
export const MutationSchema = object({ success: boolean() });
