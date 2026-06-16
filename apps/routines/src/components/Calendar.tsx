import { For, Show, createMemo, createSignal } from "solid-js";
import { useRoutines, toDateStr } from "../context";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Calendar() {
  const ctx = useRoutines();
  const today = toDateStr(new Date());

  const sel = () => ctx.selectedDate().split("-").map(Number);
  const [viewYear, setViewYear] = createSignal(sel()[0]);
  const [viewMonth, setViewMonth] = createSignal(sel()[1] - 1);

  const colorOf = createMemo(() => {
    const map = new Map<string, string>();
    for (const r of ctx.routines()) map.set(r.id, r.color);
    return map;
  });

  // Derived dots from the context's month-level completions — always in sync
  // with the routines list and completions, no independent fetch needed.
  const dots = createMemo(() => {
    const y = viewYear();
    const m = viewMonth();
    // Filter to the visible month (context loads the selected date's month,
    // which is the same month when navigating via date clicks).
    const monthPrefix = `${y}-${String(m + 1).padStart(2, "0")}-`;
    const byDate: Record<string, string[]> = {};
    for (const c of ctx.monthCompletions()) {
      if (c.date.startsWith(monthPrefix) && c.completed) {
        (byDate[c.date] ??= []).push(c.routineId);
      }
    }
    return byDate;
  });

  const cells = createMemo(() => {
    const y = viewYear();
    const m = viewMonth();
    const firstWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) out.push(toDateStr(new Date(y, m, day)));
    return out;
  });

  const step = (delta: number) => {
    const d = new Date(viewYear(), viewMonth() + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const goToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    ctx.setSelectedDate(toDateStr(now));
  };

  const viewingNow = () =>
    viewYear() === new Date().getFullYear() && viewMonth() === new Date().getMonth();

  return (
    <div class="calendar">
      <div class="calendar-bar">
        <h2 class="calendar-title">
          {MONTH_NAMES[viewMonth()]} <span class="calendar-year">{viewYear()}</span>
        </h2>
        <div class="calendar-nav">
          <Show when={!viewingNow()}>
            <button class="cal-today" onClick={goToday}>
              Today
            </button>
          </Show>
          <button class="cal-arrow" onClick={() => step(-1)} aria-label="Previous month">
            ‹
          </button>
          <button class="cal-arrow" onClick={() => step(1)} aria-label="Next month">
            ›
          </button>
        </div>
      </div>

      <div class="calendar-weekdays">
        <For each={DAY_NAMES}>{(name) => <div class="calendar-weekday">{name}</div>}</For>
      </div>

      <div class="calendar-grid">
        <For each={cells()}>
          {(date) =>
            date === null ? (
              <div class="cal-cell empty" />
            ) : (
              <button
                type="button"
                class="cal-cell"
                classList={{ today: date === today, selected: date === ctx.selectedDate() }}
                onClick={() => ctx.setSelectedDate(date)}
              >
                <span class="cal-num">{Number(date.split("-")[2])}</span>
                <span class="cal-dots">
                  <For each={(dots()?.[date] ?? []).slice(0, 6)}>
                    {(rid) => (
                      <span class="cal-dot" style={{ background: colorOf().get(rid) ?? "#888" }} />
                    )}
                  </For>
                  <Show when={(dots()?.[date]?.length ?? 0) > 6}>
                    <span class="cal-more">+{(dots()?.[date]?.length ?? 0) - 6}</span>
                  </Show>
                </span>
              </button>
            )
          }
        </For>
      </div>
    </div>
  );
}
