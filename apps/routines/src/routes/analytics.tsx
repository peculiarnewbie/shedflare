import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { Chart, Axis, AxisMark, AxisLabel, Bar, AxisTooltip } from "peculiar-charts";
import "../app.css";
import { useRoutines, toDateStr } from "../context";
import TopBar from "../components/TopBar";

type Period = "week" | "month" | "year";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Analytics() {
  const ctx = useRoutines();
  const [period, setPeriod] = createSignal<Period>("week");
  const [anchor, setAnchor] = createSignal(new Date());
  const [excluded, setExcluded] = createSignal<Set<string>>(new Set());

  const range = createMemo(() => {
    const a = anchor();
    if (period() === "week") {
      const s = startOfWeek(a);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return { from: toDateStr(s), to: toDateStr(e) };
    }
    if (period() === "month") {
      const s = new Date(a.getFullYear(), a.getMonth(), 1);
      const e = new Date(a.getFullYear(), a.getMonth() + 1, 0);
      return { from: toDateStr(s), to: toDateStr(e) };
    }
    return { from: `${a.getFullYear()}-01-01`, to: `${a.getFullYear()}-12-31` };
  });

  const label = createMemo(() => {
    const a = anchor();
    if (period() === "week") {
      const s = startOfWeek(a);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${f(s)} – ${f(e)}`;
    }
    if (period() === "month") {
      return a.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    return String(a.getFullYear());
  });

  const [completions] = createResource(
    () => ({ ...range(), rev: ctx.revision(), p: period() }),
    ({ from, to }) => ctx.fetchCompletions(from, to),
  );

  const activeRoutines = createMemo(() => ctx.routines().filter((r) => !excluded().has(r.id)));

  // Chart rows: one bucket per day (week/month) or per month (year); each active
  // routine is a stacked, color-coded series.
  const rows = createMemo(() => {
    const comps = completions() ?? [];
    const active = new Set(activeRoutines().map((r) => r.id));
    const buckets: { label: string; key: string }[] = [];
    const bucketOf = new Map<string, string>(); // dateStr → bucket key

    if (period() === "year") {
      for (let m = 0; m < 12; m++) buckets.push({ label: MONTHS[m], key: String(m) });
    } else {
      const { from, to } = range();
      const start = new Date(from);
      const end = new Date(to);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = toDateStr(d);
        const lbl =
          period() === "week"
            ? d.toLocaleDateString("en-US", { weekday: "short" })
            : String(d.getDate());
        buckets.push({ label: lbl, key: ds });
        bucketOf.set(ds, ds);
      }
    }

    const rowByKey = new Map<string, Record<string, number | string>>();
    for (const b of buckets) {
      const row: Record<string, number | string> = { label: b.label };
      for (const r of activeRoutines()) row[r.id] = 0;
      rowByKey.set(b.key, row);
    }

    for (const c of comps) {
      if (!active.has(c.routineId)) continue;
      const key = period() === "year" ? String(new Date(c.date).getMonth()) : bucketOf.get(c.date);
      if (key === undefined) continue;
      const row = rowByKey.get(key);
      if (row) row[c.routineId] = (row[c.routineId] as number) + 1;
    }

    return buckets.map((b) => rowByKey.get(b.key)!);
  });

  const totalDone = createMemo(() => {
    const active = new Set(activeRoutines().map((r) => r.id));
    return (completions() ?? []).filter((c) => active.has(c.routineId)).length;
  });

  const step = (delta: number) => {
    const a = new Date(anchor());
    if (period() === "week") a.setDate(a.getDate() + 7 * delta);
    else if (period() === "month") a.setMonth(a.getMonth() + delta);
    else a.setFullYear(a.getFullYear() + delta);
    setAnchor(a);
  };

  const toggleRoutine = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div class="app">
      <Show when={!ctx.loading()} fallback={<div class="loading">Loading…</div>}>
        <TopBar />
        <main class="analytics">
          <div class="analytics-head reveal">
            <div>
              <p class="status-eyebrow">Looking back</p>
              <h1 class="page-title">Your rhythm</h1>
            </div>
            <div class="period-tabs">
              <For each={["week", "month", "year"] as Period[]}>
                {(p) => (
                  <button
                    class="period-tab"
                    classList={{ active: period() === p }}
                    onClick={() => setPeriod(p)}
                  >
                    {p}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="analytics-card reveal" style={{ "animation-delay": "60ms" }}>
            <Show
              when={!completions.loading}
              fallback={<div class="chart-empty">Loading history…</div>}
            >
              <div class="analytics-bar">
                <div class="period-nav">
                  <button class="cal-arrow" onClick={() => step(-1)} aria-label="Previous">
                    ‹
                  </button>
                  <span class="period-label">{label()}</span>
                  <button class="cal-arrow" onClick={() => step(1)} aria-label="Next">
                    ›
                  </button>
                  <button class="cal-today" onClick={() => setAnchor(new Date())}>
                    Now
                  </button>
                </div>
                <span class="analytics-total">
                  <b>{totalDone()}</b> completions
                </span>
              </div>

              <Show
                when={activeRoutines().length > 0}
                fallback={<div class="chart-empty">No routines selected.</div>}
              >
                <div class="chart-box">
                  <Chart data={rows()} height={300}>
                    <Axis axis="x" position="bottom" dataKey="label" type="point">
                      <AxisMark />
                      <AxisLabel />
                      <AxisTooltip />
                    </Axis>
                    <Axis axis="y" position="left">
                      <AxisMark />
                      <AxisLabel />
                    </Axis>
                    <For each={activeRoutines()}>
                      {(r) => (
                        <Bar
                          dataKey={r.id}
                          name={r.name}
                          color={r.color}
                          fill={r.color}
                          stackId="routines"
                        />
                      )}
                    </For>
                  </Chart>
                </div>
              </Show>

              <div class="filter-chips">
                <span class="filter-label">Filter:</span>
                <For each={ctx.routines()}>
                  {(r) => (
                    <button
                      class="chip"
                      classList={{ off: excluded().has(r.id) }}
                      style={{ "--c": r.color }}
                      onClick={() => toggleRoutine(r.id)}
                    >
                      <span class="chip-dot" />
                      {r.name}
                    </button>
                  )}
                </For>
                <Show when={ctx.routines().length === 0}>
                  <span class="filter-label">No routines yet.</span>
                </Show>
              </div>
            </Show>
          </div>
        </main>
      </Show>
    </div>
  );
}
