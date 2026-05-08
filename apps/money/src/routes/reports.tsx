/**
 * Reports page — configurable dashboard with live D3 chart components.
 * Loads data from the API and renders the appropriate chart.
 */
import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import { AreaChart, BarChart, DonutChart, BudgetBar } from "../charts";
import type { TimeSeriesPoint, BarGroup, PieSlice, BudgetPair } from "../charts";

type ReportId = "net-worth" | "cash-flow" | "spending" | "budget-analysis" | "age-of-money";

const REPORTS: Array<{ id: ReportId; label: string; icon: string; description: string }> = [
  { id: "net-worth", label: "Net Worth", icon: "📈", description: "Total assets minus liabilities over time" },
  { id: "cash-flow", label: "Cash Flow", icon: "💵", description: "Monthly income vs expenses" },
  { id: "spending", label: "Spending", icon: "🍩", description: "Spending breakdown by category" },
  { id: "budget-analysis", label: "Budget vs Actual", icon: "📊", description: "Budgeted vs actual spending per category" },
  { id: "age-of-money", label: "Age of Money", icon: "⏰", description: "How many days your money lasts" },
];

export default function ReportsPage() {
  const [activeReport, setActiveReport] = createSignal<ReportId>("net-worth");

  // Lazy-load report data
  const [netWorthData, setNetWorthData] = createSignal<TimeSeriesPoint[]>([]);
  const [cashFlowData, setCashFlowData] = createSignal<BarGroup[]>([]);
  const [spendingData, setSpendingData] = createSignal<PieSlice[]>([]);
  const [budgetData, setBudgetData] = createSignal<BudgetPair[]>([]);
  const [ageOfMoney, setAgeOfMoney] = createSignal<number | null>(null);
  const [loading, setLoading] = createSignal(false);

  createEffect(() => {
    const report = activeReport();
    void loadReport(report);
  });

  async function loadReport(report: ReportId) {
    setLoading(true);
    try {
      switch (report) {
        case "net-worth": {
          const res = await fetch("/api/reports/net-worth");
          if (res.ok) {
            const data = (await res.json() as any).points ?? [];
            setNetWorthData(data as TimeSeriesPoint[]);
          }
          break;
        }
        case "cash-flow": {
          const res = await fetch("/api/reports/cash-flow");
          if (res.ok) {
            const data = (await res.json() as any).months ?? [];
            const groups: BarGroup[] = data.map((m: any) => ({
              category: m.month,
              values: [
                { label: "Income", value: m.income ?? 0, color: "var(--positive)" },
                { label: "Expenses", value: m.expense ?? 0, color: "var(--negative)" },
              ],
            }));
            setCashFlowData(groups);
          }
          break;
        }
        case "spending": {
          const res = await fetch("/api/reports/spending");
          if (res.ok) {
            const data = (await res.json() as any).categories ?? [];
            setSpendingData(data as PieSlice[]);
          }
          break;
        }
        case "budget-analysis": {
          const res = await fetch("/api/reports/budget-analysis");
          if (res.ok) {
            const data = (await res.json() as any).categories ?? [];
            setBudgetData(data as BudgetPair[]);
          }
          break;
        }
        case "age-of-money": {
          const res = await fetch("/api/reports/age-of-money");
          if (res.ok) {
            const data = await res.json() as any;
            setAgeOfMoney(data.days ?? null);
          }
          break;
        }
      }
    } catch {
      // Will work when DO handles these endpoints
    } finally {
      setLoading(false);
    }
  }

  // Format month labels for charts
  const formatMonth = (dateStr: string) => {
    if (!dateStr || dateStr.length < 7) return dateStr;
    const [y, m] = dateStr.split("-");
    const d = new Date(Number(y), Number(m) - 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  return (
    <div class="page">
      <h1 class="page-title">Reports</h1>
      <p class="page-subtitle">Visualize your financial data</p>

      {/* Report tabs */}
      <div class="report-tabs">
        <For each={REPORTS}>
          {(report) => (
            <button
              class="report-tab"
              classList={{ active: activeReport() === report.id }}
              onClick={() => setActiveReport(report.id)}
            >
              <span>{report.icon}</span>
              <span>{report.label}</span>
            </button>
          )}
        </For>
      </div>

      {/* Report content */}
      <div class="report-content">
        <Show when={!loading()} fallback={<div class="loading">Loading report data...</div>}>
          <Show when={activeReport() === "net-worth"}>
            <div class="report-card">
              <h2 class="report-title">Net Worth Over Time</h2>
              <p class="report-description">Your total assets minus liabilities, tracked monthly.</p>
              <AreaChart
                data={netWorthData()}
                dimensions={{ width: 700, height: 300, marginBottom: 40 }}
              />
            </div>
          </Show>

          <Show when={activeReport() === "cash-flow"}>
            <div class="report-card">
              <h2 class="report-title">Cash Flow</h2>
              <p class="report-description">Income versus expenses by month.</p>
              <BarChart
                groups={cashFlowData()}
                stacked={false}
                dimensions={{ width: 700, height: 300, marginBottom: 40 }}
                formatX={formatMonth}
              />
            </div>
          </Show>

          <Show when={activeReport() === "spending"}>
            <div class="report-card">
              <h2 class="report-title">Spending by Category</h2>
              <p class="report-description">Where your money went this period.</p>
              <DonutChart
                slices={spendingData()}
                dimensions={{ width: 500, height: 350 }}
              />
            </div>
          </Show>

          <Show when={activeReport() === "budget-analysis"}>
            <div class="report-card">
              <h2 class="report-title">Budget vs Actuals</h2>
              <p class="report-description">How each category compares to its budget.</p>
              <BudgetBar
                data={budgetData()}
                maxCategories={15}
              />
            </div>
          </Show>

          <Show when={activeReport() === "age-of-money"}>
            <div class="report-card" style={{ "text-align": "center" }}>
              <h2 class="report-title">Age of Money</h2>
              <p class="report-description">
                How many days your current cash would last based on average daily spending.
              </p>
              <div class="age-display" style={{ padding: "32px" }}>
                <Show
                  when={ageOfMoney() !== null}
                  fallback={<span style={{ color: "var(--text-muted)" }}>Not enough data to calculate</span>}
                >
                  <span class="age-number" style={{ "font-size": "3rem", "font-weight": 700 }}>
                    {ageOfMoney()}
                  </span>
                  <span class="age-unit" style={{ "font-size": "1rem", "color": "var(--text-secondary)", "margin-left": "8px" }}>
                    days
                  </span>
                </Show>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
