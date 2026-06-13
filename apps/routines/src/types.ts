export interface Routine {
  id: string;
  name: string;
  color: string;
  durationMinutes: number;
  /** 0 = daily; N > 0 = weekly quota of N per week. */
  weeklyTarget: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineCompletion {
  id: string;
  routineId: string;
  date: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DayRoutines {
  routines: Routine[];
  completions: RoutineCompletion[];
  sleepTime: string;
}
