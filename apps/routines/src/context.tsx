import { createContext, createEffect, createSignal, useContext, type JSX } from "solid-js";
import type { Routine, RoutineCompletion } from "./types";

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface RoutineInput {
  name: string;
  durationMinutes: number;
  color: string;
  weeklyTarget: number;
}

interface RoutinesContextValue {
  userEmail: () => string;
  loading: () => boolean;

  selectedDate: () => string;
  setSelectedDate: (date: string) => void;

  routines: () => Routine[];
  completions: () => RoutineCompletion[];
  /** Completed count this week (Sun–Sat of the selected date) per routine id. */
  weekCounts: () => Record<string, number>;
  sleepTime: () => string;
  /** Bumps on any mutation so views (calendar, analytics) can re-fetch ranges. */
  revision: () => number;

  addRoutine: (input: RoutineInput) => Promise<void>;
  updateRoutine: (id: string, input: RoutineInput) => Promise<void>;
  deleteRoutine: (id: string) => Promise<void>;
  toggleCompletion: (routineId: string) => Promise<void>;
  updateSleepTime: (sleepTime: string) => Promise<void>;
  /** Completed completions across an inclusive [from, to] range. */
  fetchCompletions: (from: string, to: string) => Promise<RoutineCompletion[]>;
}

const RoutinesContext = createContext<RoutinesContextValue>();

export function RoutinesProvider(props: { children: JSX.Element }) {
  const [userEmail, setUserEmail] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [selectedDate, setSelectedDate] = createSignal(toDateStr(new Date()));

  const [routines, setRoutines] = createSignal<Routine[]>([]);
  const [completions, setCompletions] = createSignal<RoutineCompletion[]>([]);
  const [weekCounts, setWeekCounts] = createSignal<Record<string, number>>({});
  const [sleepTime, setSleepTime] = createSignal("22:00");
  const [revision, setRevision] = createSignal(0);

  async function loadDay(date: string) {
    const resp = await fetch(`/api/routines/day?date=${date}`);
    if (resp.status === 401 || resp.status === 403) {
      window.location.replace("/api/auth/login?auto=1");
      return;
    }
    if (!resp.ok) return;
    const data = (await resp.json()) as {
      routines: Routine[];
      completions: RoutineCompletion[];
      weekCounts: Record<string, number>;
      sleepTime: string;
    };
    setRoutines(data.routines);
    setCompletions(data.completions);
    setWeekCounts(data.weekCounts ?? {});
    setSleepTime(data.sleepTime);
  }

  async function fetchCompletions(from: string, to: string): Promise<RoutineCompletion[]> {
    const resp = await fetch(`/api/routines/completions?from=${from}&to=${to}`);
    if (!resp.ok) return [];
    const data = (await resp.json()) as { completions: RoutineCompletion[] };
    return data.completions;
  }

  async function bootstrap() {
    try {
      const session = await fetch("/api/session");
      if (!session.ok) {
        window.location.replace("/api/auth/login?auto=1");
        return;
      }
      const user = (await session.json()) as { user: { email: string } };
      setUserEmail(user.user.email);
      await loadDay(selectedDate());
    } catch (err) {
      console.error("Failed to bootstrap:", err);
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    const date = selectedDate();
    if (!userEmail()) return;
    void loadDay(date);
  });

  const bump = () => setRevision((r) => r + 1);

  const addRoutine = async (input: RoutineInput) => {
    const resp = await fetch("/api/routines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (resp.ok) {
      await loadDay(selectedDate());
      bump();
    }
  };

  const updateRoutine = async (id: string, input: RoutineInput) => {
    const resp = await fetch(`/api/routines/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (resp.ok) {
      await loadDay(selectedDate());
      bump();
    }
  };

  const deleteRoutine = async (id: string) => {
    const resp = await fetch(`/api/routines/${id}`, { method: "DELETE" });
    if (resp.ok) {
      await loadDay(selectedDate());
      bump();
    }
  };

  const toggleCompletion = async (routineId: string) => {
    const resp = await fetch("/api/routines/completion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ routineId, date: selectedDate() }),
    });
    if (resp.ok) {
      await loadDay(selectedDate());
      bump();
    }
  };

  const updateSleepTime = async (value: string) => {
    const resp = await fetch("/api/routines/settings/sleep-time", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sleepTime: value }),
    });
    if (resp.ok) setSleepTime(value);
  };

  void bootstrap();

  return (
    <RoutinesContext.Provider
      value={{
        userEmail,
        loading,
        selectedDate,
        setSelectedDate,
        routines,
        completions,
        weekCounts,
        sleepTime,
        revision,
        addRoutine,
        updateRoutine,
        deleteRoutine,
        toggleCompletion,
        updateSleepTime,
        fetchCompletions,
      }}
    >
      {props.children}
    </RoutinesContext.Provider>
  );
}

export function useRoutines() {
  const ctx = useContext(RoutinesContext);
  if (!ctx) throw new Error("useRoutines must be used within RoutinesProvider");
  return ctx;
}
