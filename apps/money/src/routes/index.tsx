/**
 * Dashboard — dynamic widget grid with configurable cards and charts.
 * Reads widget layout from dashboard_widgets table, renders by widget type.
 */
import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useCurrency } from "../lib/currency";
import { usePrivacyMode } from "../lib/privacy";
import { dispatch } from "../lib/pending-ops";
import { api } from "../lib/api";
import { createId } from "../domain/types";
import { settingsCollection } from "../lib/collections";
import { AreaChart, BarChart, DonutChart, BudgetBar } from "../charts";
import { PageState } from "../components/PageState";
import type { TimeSeriesPoint, BarGroup, PieSlice, BudgetPair } from "../charts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WidgetType =
  | "summary-card"
  | "overview-summary-card"
  | "net-worth-card"
  | "cash-flow-card"
  | "spending-card"
  | "budget-analysis-card"
  | "age-of-money-card"
  | "markdown-card"
  | "calendar-heatmap-card"
  | "crossover-card";

interface WidgetDef {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  width: number;
  height: number;
  meta: string | null;
}

const GRID_COLS = 12;
const ROW_HEIGHT = 100;

const ALL_WIDGET_TYPES: { type: WidgetType; label: string }[] = [
  { type: "summary-card", label: "Summary Card" },
  { type: "overview-summary-card", label: "Overview Summary" },
  { type: "net-worth-card", label: "Net Worth Chart" },
  { type: "cash-flow-card", label: "Cash Flow Chart" },
  { type: "spending-card", label: "Spending Chart" },
  { type: "budget-analysis-card", label: "Budget Analysis" },
  { type: "age-of-money-card", label: "Age of Money" },
  { type: "markdown-card", label: "Markdown Note" },
  { type: "calendar-heatmap-card", label: "Calendar Heatmap" },
  { type: "crossover-card", label: "FI-RE Crossover" },
];

// ---------------------------------------------------------------------------
// Default widget layout (seeded on first visit)
// ---------------------------------------------------------------------------

function buildDefaultWidgets(): WidgetDef[] {
  return [
    {
      id: createId("wgt"),
      type: "summary-card",
      x: 0,
      y: 0,
      width: 4,
      height: 1,
      meta: JSON.stringify({ label: "Net Worth", source: "netWorth" }),
    },
    {
      id: createId("wgt"),
      type: "summary-card",
      x: 4,
      y: 0,
      width: 4,
      height: 1,
      meta: JSON.stringify({ label: "On Budget", source: "onBudget" }),
    },
    {
      id: createId("wgt"),
      type: "summary-card",
      x: 8,
      y: 0,
      width: 4,
      height: 1,
      meta: JSON.stringify({ label: "Accounts", source: "accountCount" }),
    },
    {
      id: createId("wgt"),
      type: "summary-card",
      x: 0,
      y: 1,
      width: 4,
      height: 1,
      meta: JSON.stringify({ label: "Income This Month", source: "income" }),
    },
    {
      id: createId("wgt"),
      type: "summary-card",
      x: 4,
      y: 1,
      width: 4,
      height: 1,
      meta: JSON.stringify({ label: "Expenses This Month", source: "expense" }),
    },
    {
      id: createId("wgt"),
      type: "summary-card",
      x: 8,
      y: 1,
      width: 4,
      height: 1,
      meta: JSON.stringify({ label: "Net This Month", source: "net" }),
    },
    {
      id: createId("wgt"),
      type: "net-worth-card",
      x: 0,
      y: 2,
      width: 6,
      height: 3,
      meta: null,
    },
    {
      id: createId("wgt"),
      type: "cash-flow-card",
      x: 6,
      y: 2,
      width: 6,
      height: 3,
      meta: null,
    },
    {
      id: createId("wgt"),
      type: "spending-card",
      x: 0,
      y: 5,
      width: 4,
      height: 3,
      meta: null,
    },
    {
      id: createId("wgt"),
      type: "budget-analysis-card",
      x: 4,
      y: 5,
      width: 4,
      height: 3,
      meta: null,
    },
    {
      id: createId("wgt"),
      type: "age-of-money-card",
      x: 8,
      y: 5,
      width: 4,
      height: 3,
      meta: null,
    },
    {
      id: createId("wgt"),
      type: "calendar-heatmap-card",
      x: 0,
      y: 8,
      width: 6,
      height: 4,
      meta: null,
    },
    {
      id: createId("wgt"),
      type: "crossover-card",
      x: 6,
      y: 8,
      width: 6,
      height: 4,
      meta: null,
    },
    {
      id: createId("wgt"),
      type: "overview-summary-card",
      x: 0,
      y: 12,
      width: 12,
      height: 2,
      meta: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Widget data fetchers
// ---------------------------------------------------------------------------

async function fetchOverview(): Promise<Record<string, number>> {
  try {
    const data = await api.budgetOverview();
    return data as Record<string, number>;
  } catch {
    return {};
  }
}

async function fetchNetWorthData(): Promise<TimeSeriesPoint[]> {
  try {
    const data = await api.reports.netWorth();
    return data.points as TimeSeriesPoint[];
  } catch {
    return [];
  }
}

async function fetchCashFlowData(): Promise<BarGroup[]> {
  try {
    const data = await api.reports.cashFlow();
    return data.months.map((m) => ({
      category: m.month,
      values: [
        { label: "Income", value: m.income ?? 0, color: "var(--positive)" },
        { label: "Expenses", value: m.expense ?? 0, color: "var(--negative)" },
      ],
    }));
  } catch {
    return [];
  }
}

async function fetchSpendingData(): Promise<PieSlice[]> {
  try {
    const data = await api.reports.spending();
    return [...data.categories] as PieSlice[];
  } catch {
    return [];
  }
}

async function fetchBudgetData(): Promise<BudgetPair[]> {
  try {
    const data = await api.reports.budgetAnalysis();
    return data.categories as BudgetPair[];
  } catch {
    return [];
  }
}

async function fetchAgeOfMoney(): Promise<number | null> {
  try {
    const data = await api.reports.ageOfMoney();
    return data.days ?? null;
  } catch {
    return null;
  }
}

interface CrossoverData {
  currentBalance: number;
  targetNestEgg: number;
  medianExpense: number;
  savingsRate: number;
  yearsToRetire: number | null;
  yearsToRetireFormatted: string;
  dataPoints: Array<{
    month: string;
    balance: number;
    investmentIncome: number;
    expenses: number;
    isProjection: boolean;
  }>;
}

async function fetchCrossoverData() {
  try {
    return await api.reports.crossover();
  } catch {
    return null;
  }
}

async function fetchCalendarHeatmap() {
  try {
    return await api.reports.calendarHeatmap();
  } catch {
    return { monthKey: "", days: {} as Record<string, number> };
  }
}

const formatMonth = (dateStr: string) => {
  if (!dateStr || dateStr.length < 7) return dateStr;
  const [y, m] = dateStr.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const navigate = useNavigate();
  const fmt = useCurrency();
  const privacyBlur = usePrivacyMode();

  // Widget definitions from server
  const [widgets, setWidgets] = createSignal<WidgetDef[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [seeding, setSeeding] = createSignal(false);

  // Aggregate overview data
  const [overview, setOverview] = createSignal<Record<string, number>>({});

  // Chart data per widget type (lazy-loaded)
  const [netWorthData, setNetWorthData] = createSignal<TimeSeriesPoint[]>([]);
  const [cashFlowData, setCashFlowData] = createSignal<BarGroup[]>([]);
  const [spendingData, setSpendingData] = createSignal<PieSlice[]>([]);
  const [budgetData, setBudgetData] = createSignal<BudgetPair[]>([]);
  const [ageOfMoneyData, setAgeOfMoneyData] = createSignal<number | null>(null);
  const [calendarHeatmapData, setCalendarHeatmapData] = createSignal<{
    monthKey: string;
    days: Record<string, number>;
  }>({ monthKey: "", days: {} });
  const [crossoverData, setCrossoverData] = createSignal<CrossoverData | null>(null);

  // Add widget modal
  const [showAddModal, setShowAddModal] = createSignal(false);

  // Markdown card editing
  const [markdownEditId, setMarkdownEditId] = createSignal<string | null>(null);
  const [markdownDraft, setMarkdownDraft] = createSignal("");

  // -----------------------------------------------------------------------
  // Load widgets and overview on mount
  // -----------------------------------------------------------------------

  async function loadWidgets() {
    try {
      const data = await api.dashboard.widgets();
      return [...data.widgets] as WidgetDef[];
    } catch {
      console.warn("[dashboard] failed to load widgets");
      return [];
    }
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, loadedWidgets] = await Promise.all([fetchOverview(), loadWidgets()]);
      setOverview(overviewData);

      if (loadedWidgets.length > 0) {
        setWidgets(loadedWidgets);
      } else {
        // Auto-seed default widgets on first visit
        setSeeding(true);
        const defaults = buildDefaultWidgets();
        dispatch("update_dashboard", {
          widgets: defaults.map((w) => ({
            id: w.id,
            type: w.type,
            x: w.x,
            y: w.y,
            width: w.width,
            height: w.height,
            meta: w.meta,
          })),
        });
        setWidgets(defaults);
        setSeeding(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------------------------------------------------
  // Data hydrator — fetches chart data based on visible widgets
  // -----------------------------------------------------------------------

  createEffect(() => {
    const visibleWidgets = widgets();
    const hasType = (t: WidgetType) => visibleWidgets.some((w) => w.type === t);

    if (hasType("net-worth-card")) {
      void fetchNetWorthData().then(setNetWorthData);
    }
    if (hasType("cash-flow-card")) {
      void fetchCashFlowData().then(setCashFlowData);
    }
    if (hasType("spending-card")) {
      void fetchSpendingData().then(setSpendingData);
    }
    if (hasType("budget-analysis-card")) {
      void fetchBudgetData().then(setBudgetData);
    }
    if (hasType("age-of-money-card")) {
      void fetchAgeOfMoney().then(setAgeOfMoneyData);
    }
    if (hasType("calendar-heatmap-card")) {
      void fetchCalendarHeatmap().then(setCalendarHeatmapData);
    }
    if (hasType("crossover-card")) {
      void fetchCrossoverData().then(setCrossoverData);
    }
  });

  const loaded = () => widgets().length > 0;

  // -----------------------------------------------------------------------
  // Widget add/remove
  // -----------------------------------------------------------------------

  function addWidget(type: WidgetType) {
    // Find next available position at the bottom
    const maxY = widgets().reduce((max, w) => Math.max(max, w.y + w.height), 0);
    const colWidth = type.startsWith("summary-")
      ? 4
      : type === "overview-summary-card"
        ? 12
        : type === "age-of-money-card" ||
            type === "markdown-card" ||
            type === "calendar-heatmap-card" ||
            type === "crossover-card"
          ? 6
          : 6;

    // Check current row occupancy at maxY
    const rowOccupied = Array.from({ length: GRID_COLS }, () => false);
    for (const w of widgets()) {
      if (w.y + w.height > maxY && w.y < maxY + 1) {
        for (let c = w.x; c < w.x + w.width && c < GRID_COLS; c++) {
          rowOccupied[c] = true;
        }
      }
    }
    // Find first gap in last row
    let x = 0;
    for (let c = 0; c <= GRID_COLS - colWidth; c++) {
      if (!rowOccupied.slice(c, c + colWidth).some(Boolean)) {
        x = c;
        break;
      }
    }

    const newWidget: WidgetDef = {
      id: createId("wgt"),
      type,
      x,
      y: maxY,
      width: colWidth,
      height: type.startsWith("summary-")
        ? 1
        : type === "overview-summary-card"
          ? 2
          : type === "markdown-card"
            ? 2
            : type === "calendar-heatmap-card" || type === "crossover-card"
              ? 4
              : 3,
      meta:
        type === "summary-card"
          ? JSON.stringify({ label: "New Summary", source: "netWorth" })
          : type === "markdown-card"
            ? JSON.stringify({ content: "Write your notes here..." })
            : null,
    };
    const next = [...widgets(), newWidget];
    setWidgets(next);
    dispatch("update_dashboard", {
      widgets: next.map((w) => ({
        id: w.id,
        type: w.type,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
        meta: w.meta,
      })),
    });
    setShowAddModal(false);
  }

  function removeWidget(id: string) {
    const next = widgets().filter((w) => w.id !== id);
    setWidgets(next);
    dispatch("update_dashboard", {
      widgets: next.map((w) => ({
        id: w.id,
        type: w.type,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
        meta: w.meta,
      })),
    });
  }

  // -----------------------------------------------------------------------
  // Widget renderers
  // -----------------------------------------------------------------------

  function renderWidgetContent(def: WidgetDef) {
    const meta = def.meta ? (tryParseJson(def.meta) as Record<string, unknown> | null) : null;

    switch (def.type) {
      case "summary-card": {
        const source = (meta?.source as string) ?? "netWorth";
        const label = (meta?.label as string) ?? source;
        let value = 0;
        switch (source) {
          case "netWorth":
            value = overview().netWorth ?? 0;
            break;
          case "onBudget":
            value = overview().onBudget ?? 0;
            break;
          case "accountCount":
            value = overview().accountCount ?? 0;
            break;
          case "income":
            value = overview().income ?? 0;
            break;
          case "expense":
            value = overview().expense ?? 0;
            break;
          case "net": {
            const inc = overview().income ?? 0;
            const exp = overview().expense ?? 0;
            value = inc - exp;
            break;
          }
        }
        const isCurrency = source !== "accountCount";
        return (
          <div class="widget-summary">
            <div class="widget-summary-label">{label}</div>
            <div
              class={`widget-summary-value ${privacyBlur().blurIf(isCurrency)}`}
              classList={{
                positive: isCurrency && value >= 0,
                negative: isCurrency && value < 0,
              }}
            >
              {isCurrency ? fmt().formatCents(value) : String(Math.round(value))}
            </div>
          </div>
        );
      }

      case "overview-summary-card": {
        const stats = [
          { label: "Net Worth", value: overview().netWorth ?? 0 },
          { label: "On Budget", value: overview().onBudget ?? 0 },
          { label: "Income", value: overview().income ?? 0 },
          { label: "Expenses", value: overview().expense ?? 0 },
        ];
        return (
          <div class="widget-overview-summary">
            {stats.map((s) => (
              <div class="overview-stat">
                <span class="overview-stat-label">{s.label}</span>
                <span
                  class={`overview-stat-value ${privacyBlur().blurIf(true)}`}
                  classList={{ positive: s.value >= 0, negative: s.value < 0 }}
                >
                  {fmt().formatCents(s.value)}
                </span>
              </div>
            ))}
          </div>
        );
      }

      case "net-worth-card": {
        const data = netWorthData();
        return (
          <div class="widget-chart">
            <div class="widget-chart-title">Net Worth Over Time</div>
            <AreaChart data={data} dimensions={{ width: 480, height: 220, marginBottom: 32 }} />
          </div>
        );
      }

      case "cash-flow-card": {
        const data = cashFlowData();
        return (
          <div class="widget-chart">
            <div class="widget-chart-title">Cash Flow</div>
            <BarChart
              groups={data}
              stacked={false}
              dimensions={{ width: 480, height: 220, marginBottom: 32 }}
              formatX={formatMonth}
            />
          </div>
        );
      }

      case "spending-card": {
        const data = spendingData();
        return (
          <div class="widget-chart">
            <div class="widget-chart-title">Spending by Category</div>
            <DonutChart slices={data} dimensions={{ width: 320, height: 220 }} />
          </div>
        );
      }

      case "budget-analysis-card": {
        const data = budgetData();
        return (
          <div class="widget-chart">
            <div class="widget-chart-title">Budget vs Actuals</div>
            <BudgetBar data={data} maxCategories={10} />
          </div>
        );
      }

      case "age-of-money-card": {
        const days = ageOfMoneyData();
        return (
          <div class="widget-chart" style={{ "text-align": "center" }}>
            <div class="widget-chart-title">Age of Money</div>
            <div style={{ padding: "16px" }}>
              <Show
                when={days !== null}
                fallback={
                  <span style={{ color: "var(--text-muted)", "font-size": "0.85rem" }}>
                    Not enough data
                  </span>
                }
              >
                <span
                  style={{
                    "font-size": "2.5rem",
                    "font-weight": 700,
                    color: "var(--text)",
                  }}
                >
                  {days}
                </span>
                <span
                  style={{
                    "font-size": "0.9rem",
                    color: "var(--text-secondary)",
                    "margin-left": "6px",
                  }}
                >
                  days
                </span>
              </Show>
            </div>
          </div>
        );
      }

      case "markdown-card": {
        const isEditing = markdownEditId() === def.id;
        const content =
          meta != null && typeof meta === "object" && "content" in meta
            ? (meta.content as string)
            : "";
        return (
          <div class="widget-markdown">
            <Show
              when={!isEditing}
              fallback={
                <div class="widget-markdown-edit">
                  <textarea
                    value={markdownDraft()}
                    onInput={(e) => setMarkdownDraft(e.currentTarget.value)}
                    autofocus
                    placeholder="Write markdown here..."
                    rows={6}
                  />
                  <div class="widget-markdown-edit-actions">
                    <button class="btn btn-primary btn-xs" onClick={() => saveMarkdown(def.id)}>
                      Save
                    </button>
                    <button class="btn btn-ghost btn-xs" onClick={cancelEditMarkdown}>
                      Cancel
                    </button>
                  </div>
                </div>
              }
            >
              <div
                class="widget-markdown-content"
                onClick={() => startEditMarkdown(def)}
                innerHTML={
                  content
                    ? renderMarkdown(content)
                    : "<span class='markdown-placeholder'>Click to add notes...</span>"
                }
              />
            </Show>
          </div>
        );
      }

      case "crossover-card": {
        const data = crossoverData();
        if (!data) {
          return (
            <div class="widget-chart" style={{ "text-align": "center", "padding-top": "16px" }}>
              <span style={{ color: "var(--text-muted)", "font-size": "0.85rem" }}>
                Not enough data
              </span>
            </div>
          );
        }
        const svgWidth = 500;
        const svgHeight = 200;
        const margin = { top: 20, right: 20, bottom: 30, left: 60 };
        const plotW = svgWidth - margin.left - margin.right;
        const plotH = svgHeight - margin.top - margin.bottom;

        const allValues = data.dataPoints.flatMap((d) => [d.investmentIncome, d.expenses]);
        const yMin = 0;
        const yMax = Math.max(...allValues) * 1.1 || 1;
        const xScale = (i: number) =>
          margin.left + (i / Math.max(data.dataPoints.length - 1, 1)) * plotW;
        const yScale = (v: number) => margin.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

        const incLine = data.dataPoints
          .map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(d.investmentIncome)}`)
          .join(" ");
        const expLine = data.dataPoints
          .map((d, i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(d.expenses)}`)
          .join(" ");

        const fmt = (cents: number) => {
          const abs = Math.abs(cents);
          const sign = cents < 0 ? "-" : "";
          if (abs >= 100000) return `${sign}$${(abs / 100 / 1000).toFixed(1)}K`;
          return `${sign}$${(abs / 100).toFixed(0)}`;
        };

        return (
          <div class="widget-chart">
            <div class="widget-chart-title">FI-RE Crossover Projection</div>
            <div class="crossover-summary">
              <div class="crossover-stat">
                <span class="crossover-stat-label">Nest Egg</span>
                <span class={`crossover-stat-value ${privacyBlur().blurClass()}`}>
                  {fmt(data.currentBalance)}
                </span>
              </div>
              <div class="crossover-stat">
                <span class="crossover-stat-label">
                  {data.yearsToRetire !== null ? "To FI" : "Target"}
                </span>
                <span class={`crossover-stat-value highlight ${privacyBlur().blurClass()}`}>
                  {data.yearsToRetire !== null
                    ? data.yearsToRetireFormatted
                    : fmt(data.targetNestEgg)}
                </span>
              </div>
              <div class="crossover-stat">
                <span class="crossover-stat-label">Monthly</span>
                <span class={`crossover-stat-value ${privacyBlur().blurClass()}`}>
                  {fmt(data.medianExpense)}
                </span>
              </div>
              <div class="crossover-stat">
                <span class="crossover-stat-label">Savings</span>
                <span class="crossover-stat-value">{(data.savingsRate * 100).toFixed(0)}%</span>
              </div>
            </div>
            <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
              <line
                x1={margin.left}
                y1={yScale(0)}
                x2={margin.left + plotW}
                y2={yScale(0)}
                stroke="var(--border)"
              />
              <path d={incLine} fill="none" stroke="var(--positive)" stroke-width="2" />
              <path
                d={expLine}
                fill="none"
                stroke="var(--negative)"
                stroke-width="2"
                stroke-dasharray="4 3"
              />
            </svg>
          </div>
        );
      }

      case "calendar-heatmap-card": {
        const { monthKey, days } = calendarHeatmapData();
        if (!monthKey) {
          return (
            <div class="widget-chart" style={{ "text-align": "center", "padding-top": "16px" }}>
              <span style={{ color: "var(--text-muted)", "font-size": "0.85rem" }}>No data</span>
            </div>
          );
        }
        const [year, mon] = monthKey.split("-").map(Number);
        const daysInMonth = new Date(year, mon, 0).getDate();
        const firstDay = new Date(year, mon - 1, 1).getDay();
        const firstDayOfWeekSetting =
          (settingsCollection.state.get("first_day_of_week")?.value as string) ?? "sunday";
        const mondayFirst = firstDayOfWeekSetting === "monday";
        const dayLabels = mondayFirst
          ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const padCount = mondayFirst ? (firstDay + 6) % 7 : firstDay;

        const maxAbs = Math.max(1, ...Object.values(days).map((v) => Math.abs(v)));
        const intensity = (day: number) => {
          const date = `${monthKey}-${String(day).padStart(2, "0")}`;
          const val = days[date] ?? 0;
          const absVal = Math.abs(val);
          const pct = absVal / maxAbs;
          const isExpense = val < 0;
          const hue = isExpense ? 0 : 145;
          const lightness = 30 + Math.round(pct * 35);
          return {
            background: `hsl(${hue}, 60%, ${lightness}%)`,
            amount: val,
          };
        };

        const cells: { day: number; style: ReturnType<typeof intensity> }[] = [];
        for (let d = 1; d <= daysInMonth; d++) {
          cells.push({ day: d, style: intensity(d) });
        }

        const padStart = Array.from({ length: padCount }, (_, _i) => (
          <div class="heatmap-cell heatmap-cell-empty" />
        ));

        return (
          <div class="widget-chart">
            <div class="widget-chart-title">
              Spending &mdash;{" "}
              {new Date(year, mon - 1).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </div>
            <div class="heatmap-grid">
              {dayLabels.map((l) => (
                <div class="heatmap-day-label">{l}</div>
              ))}
              {padStart}
              {cells.map((c) => (
                <div
                  class="heatmap-cell"
                  style={{ background: c.style.background }}
                  title={`${c.day}: ${fmt().formatCents(c.style.amount)}`}
                >
                  <span class="heatmap-cell-day">{c.day}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }
    }
  }

  function tryParseJson(s: string): unknown {
    try {
      return JSON.parse(s);
    } catch {
      console.warn("[dashboard] failed to parse JSON");
      return null;
    }
  }

  function renderMarkdown(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
      .replace(/\n/g, "<br>");
  }

  function startEditMarkdown(def: WidgetDef) {
    const meta = def.meta ? (tryParseJson(def.meta) as Record<string, unknown> | null) : null;
    setMarkdownDraft((meta?.content as string) ?? "");
    setMarkdownEditId(def.id);
  }

  function saveMarkdown(id: string) {
    const content = markdownDraft();
    const next = widgets().map((w) =>
      w.id === id ? { ...w, meta: JSON.stringify({ content }) } : w,
    );
    setWidgets(next);
    dispatch("update_dashboard", {
      widgets: next.map((w) => ({
        id: w.id,
        type: w.type,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
        meta: w.meta,
      })),
    });
    setMarkdownEditId(null);
    setMarkdownDraft("");
  }

  function cancelEditMarkdown() {
    setMarkdownEditId(null);
    setMarkdownDraft("");
  }

  async function exportDashboard() {
    try {
      const data = await api.dashboard.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "shedflare-dashboard.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      console.warn("[dashboard] failed to export dashboard");
      /* ignore */
    }
  }

  async function importDashboard(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.widgets || !Array.isArray(data.widgets)) {
        alert("Invalid dashboard file: missing widgets array");
        return;
      }
      dispatch("update_dashboard", {
        widgets: data.widgets.map((w: any) => ({
          id: w.id,
          type: w.type,
          x: w.x,
          y: w.y,
          width: w.width,
          height: w.height,
          meta: w.meta ?? null,
        })),
      });
      setTimeout(() => loadAll(), 300);
    } catch (err) {
      alert(`Failed to import dashboard: ${err instanceof Error ? err.message : String(err)}`);
    }
    e.currentTarget.value = "";
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const gridStyle = createMemo(() => {
    const maxY = widgets().reduce((max, w) => Math.max(max, w.y + w.height), 0);
    return {
      display: "grid",
      "grid-template-columns": `repeat(${GRID_COLS}, 1fr)`,
      "grid-auto-rows": `${ROW_HEIGHT}px`,
      gap: "12px",
      "min-height": `${(maxY + 1) * ROW_HEIGHT}px`,
    };
  });

  function widgetStyle(w: WidgetDef) {
    return {
      "grid-column": `${w.x + 1} / span ${w.width}`,
      "grid-row": `${w.y + 1} / span ${w.height}`,
    };
  }

  return (
    <div class="page">
      <div class="dashboard-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">Your financial overview</p>
        </div>
        <div class="dashboard-header-actions">
          <button class="btn btn-secondary btn-sm" onClick={() => setShowAddModal(true)}>
            + Add Widget
          </button>
          <button class="btn btn-ghost btn-sm" onClick={exportDashboard} title="Export dashboard">
            📤
          </button>
          <label class="btn btn-ghost btn-sm" title="Import dashboard">
            📥
            <input type="file" accept=".json" style="display:none" onChange={importDashboard} />
          </label>
          <button class="btn btn-ghost btn-sm" onClick={loadAll} title="Refresh">
            &#x21bb;
          </button>
        </div>
      </div>

      <PageState
        loading={loading()}
        error={error()}
        onRetry={loadAll}
        loadingMessage="Loading dashboard data..."
      >
        <Show
          when={loaded() || seeding()}
          fallback={
            <div class="empty-state">
              <p>No dashboard widgets configured.</p>
              <button class="btn btn-primary btn-sm" onClick={() => addWidget("summary-card")}>
                Add your first widget
              </button>
            </div>
          }
        >
          <Show when={seeding()} fallback={null}>
            <div class="loading" style="margin-bottom:12px">
              Setting up your dashboard...
            </div>
          </Show>

          <div class="widget-grid" style={gridStyle()}>
            <For each={widgets()}>
              {(def) => (
                <div class="widget-card" style={widgetStyle(def)}>
                  <button
                    class="widget-close"
                    onClick={() => removeWidget(def.id)}
                    title="Remove widget"
                  >
                    &times;
                  </button>
                  {renderWidgetContent(def)}
                </div>
              )}
            </For>
          </div>

          {/* Quick actions below grid */}
          <div class="quick-actions" style="margin-top:16px">
            <button class="btn btn-primary" onClick={() => navigate("/accounts")}>
              + Add Transaction
            </button>
            <button class="btn btn-secondary" onClick={() => navigate("/budget")}>
              Go to Budget
            </button>
          </div>
        </Show>
      </PageState>

      {/* Add Widget Modal */}
      <Show when={showAddModal()}>
        <div class="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h2>Add Widget</h2>
              <button class="modal-close" onClick={() => setShowAddModal(false)}>
                &times;
              </button>
            </div>
            <div class="modal-body">
              <div class="add-widget-grid">
                <For each={ALL_WIDGET_TYPES}>
                  {(wt) => (
                    <button class="add-widget-option" onClick={() => addWidget(wt.type)}>
                      <strong>{wt.label}</strong>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
