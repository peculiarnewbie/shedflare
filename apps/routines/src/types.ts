import { array, boolean, number, object, string, type InferOutput } from "valibot";

export const RoutineSchema = object({
  id: string(),
  name: string(),
  color: string(),
  durationMinutes: number(),
  weeklyTarget: number(),
  sortOrder: number(),
  createdAt: string(),
  updatedAt: string(),
});
export type Routine = InferOutput<typeof RoutineSchema>;

export const RoutineCompletionSchema = object({
  id: string(),
  routineId: string(),
  date: string(),
  completed: boolean(),
  createdAt: string(),
  updatedAt: string(),
});
export type RoutineCompletion = InferOutput<typeof RoutineCompletionSchema>;

export const DayResponseSchema = object({
  routines: array(RoutineSchema),
  sleepTime: string(),
});
export const CompletionsResponseSchema = object({
  completions: array(RoutineCompletionSchema),
});
export const SessionResponseSchema = object({ user: object({ email: string() }) });
export const CreatedResponseSchema = object({ id: string() });

export interface DayRoutines {
  routines: Routine[];
  completions: RoutineCompletion[];
  sleepTime: string;
}
