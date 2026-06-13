import { For, Show, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { useRoutines, toDateStr } from "../context";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];

function fmt(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function StatusPanel() {
  const ctx = useRoutines();
  const [now, setNow] = createSignal(new Date());
  const [editingSleep, setEditingSleep] = createSignal(false);

  onMount(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    onCleanup(() => clearInterval(t));
  });

  const isToday = createMemo(() => ctx.selectedDate() === toDateStr(new Date()));
  const selected = createMemo(() => {
    const [y, m, d] = ctx.selectedDate().split("-").map(Number);
    return new Date(y, m - 1, d);
  });

  const colorOf = createMemo(() => {
    const map = new Map<string, string>();
    for (const r of ctx.routines()) map.set(r.id, r.color);
    return map;
  });

  const doneIds = createMemo(
    () =>
      new Set(
        ctx
          .completions()
          .filter((c) => c.completed)
          .map((c) => c.routineId),
      ),
  );
  // The ring and the "time until sleep" runway track DAILY routines only —
  // weekly-quota routines aren't pinned to today, so they don't pressure the day.
  const dailyRoutines = createMemo(() => ctx.routines().filter((r) => r.weeklyTarget === 0));
  const total = createMemo(() => dailyRoutines().length);
  const doneCount = createMemo(() => dailyRoutines().filter((r) => doneIds().has(r.id)).length);
  const remainingMins = createMemo(() =>
    dailyRoutines()
      .filter((r) => !doneIds().has(r.id))
      .reduce((s, r) => s + r.durationMinutes, 0),
  );

  const minsUntilSleep = createMemo(() => {
    const c = now();
    const [sh, sm] = ctx.sleepTime().split(":").map(Number);
    const sleep = new Date(c.getFullYear(), c.getMonth(), c.getDate(), sh, sm);
    if (c > sleep) sleep.setDate(sleep.getDate() + 1);
    return Math.max(0, Math.round((sleep.getTime() - c.getTime()) / 60_000));
  });

  const countdown = createMemo(() => {
    const c = now();
    const [sh, sm] = ctx.sleepTime().split(":").map(Number);
    const sleep = new Date(c.getFullYear(), c.getMonth(), c.getDate(), sh, sm);
    if (c > sleep) sleep.setDate(sleep.getDate() + 1);
    const diff = sleep.getTime() - c.getTime();
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      h: pad(Math.floor(diff / 3_600_000)),
      m: pad(Math.floor((diff % 3_600_000) / 60_000)),
      s: pad(Math.floor((diff % 60_000) / 1000)),
    };
  });

  const overbooked = createMemo(() => isToday() && remainingMins() > minsUntilSleep());
  const fillPercent = createMemo(() => {
    const win = minsUntilSleep();
    if (win === 0) return 100;
    return Math.min(100, (remainingMins() / win) * 100);
  });
  const ringPercent = createMemo(() => (total() === 0 ? 0 : (doneCount() / total()) * 100));

  // Last 7 days, oldest → newest, with completed routine ids per day.
  const week = createMemo(() => {
    const days: { date: string; init: string }[] = [];
    const base = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      days.push({ date: toDateStr(d), init: DAY_INITIAL[d.getDay()] });
    }
    return days;
  });
  const [recent] = createResource(
    () => ({ rev: ctx.revision(), from: week()[0].date, to: week()[6].date }),
    async ({ from, to }) => {
      const completions = await ctx.fetchCompletions(from, to);
      const byDate: Record<string, string[]> = {};
      for (const c of completions) (byDate[c.date] ??= []).push(c.routineId);
      return byDate;
    },
  );

  return (
    <div class="status">
      <div class="status-top">
        <div>
          <p class="status-eyebrow">{isToday() ? "Today" : "Viewing"}</p>
          <h2 class="status-day">{DAY_NAMES[selected().getDay()]}</h2>
          <p class="status-date">
            {selected().toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </p>
        </div>
        <div
          class="status-ring"
          style={{
            background: `conic-gradient(var(--accent) ${ringPercent()}%, var(--ring-track) 0)`,
          }}
        >
          <div class="status-ring-inner">
            <span class="status-ring-num">{doneCount()}</span>
            <span class="status-ring-den">/{total()}</span>
          </div>
        </div>
      </div>

      <Show
        when={isToday()}
        fallback={
          <p class="status-note">
            {doneCount()} of {total()} done · {fmt(remainingMins())} left unmarked
          </p>
        }
      >
        <div class="status-clock">
          <div class="clock-head">
            <span class="clock-label">until sleep</span>
            <button class="clock-cfg" onClick={() => setEditingSleep(!editingSleep())}>
              ⚙ {ctx.sleepTime()}
            </button>
          </div>
          <div class="clock-time">
            <span>{countdown().h}</span>
            <i>:</i>
            <span>{countdown().m}</span>
            <i>:</i>
            <span class="clock-sec">{countdown().s}</span>
          </div>
          <Show when={editingSleep()}>
            <input
              class="clock-input"
              type="time"
              value={ctx.sleepTime()}
              onChange={(e) => {
                void ctx.updateSleepTime(e.currentTarget.value);
                setEditingSleep(false);
              }}
            />
          </Show>
        </div>
      </Show>

      <div class="status-week">
        <span class="clock-label">last 7 days</span>
        <div class="week-strip">
          <For each={week()}>
            {(d) => (
              <button
                class="week-day"
                classList={{ on: d.date === ctx.selectedDate() }}
                onClick={() => ctx.setSelectedDate(d.date)}
              >
                <span class="week-dots">
                  <For each={(recent()?.[d.date] ?? []).slice(0, 4)}>
                    {(rid) => (
                      <span class="week-dot" style={{ background: colorOf().get(rid) ?? "#888" }} />
                    )}
                  </For>
                </span>
                <span class="week-init">{d.init}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={isToday()}>
        <div class="status-progress">
          <div class="status-progress-head">
            <span>{fmt(remainingMins())} of routines left</span>
            <span classList={{ warn: overbooked() }}>
              {overbooked() ? "not enough time!" : `${fmt(minsUntilSleep())} of runway`}
            </span>
          </div>
          <div class="bar">
            <div
              class="bar-fill"
              classList={{ warn: overbooked() }}
              style={{ width: `${fillPercent()}%` }}
            />
          </div>
        </div>
      </Show>
    </div>
  );
}
