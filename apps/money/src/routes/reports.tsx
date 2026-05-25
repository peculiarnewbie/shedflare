import { createSignal, createEffect, For, Show } from "solid-js";
import { AreaChart, BarChart, DonutChart, BudgetBar } from "../charts";
import type { TimeSeriesPoint, BarGroup, PieSlice, BudgetPair } from "../charts";
import { dispatch } from "../lib/pending-ops";
import { PageState } from "../components/PageState";

type ReportId =
  | "net-worth"
  | "cash-flow"
  | "spending"
  | "budget-analysis"
  | "age-of-money"
  | "custom";

interface CustomReport {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  graph_type: string | null;
  mode: string | null;
  group_by: string | null;
  conditions: string | null;
  metadata: string | null;
  created_at: string;
}

const REPORTS: Array<{ id: ReportId; label: string; icon: string; description: string }> = [
  {
    id: "net-worth",
    label: "Net Worth",
    icon: "📈",
    description: "Total assets minus liabilities over time",
  },
  { id: "cash-flow", label: "Cash Flow", icon: "💵", description: "Monthly income vs expenses" },
  { id: "spending", label: "Spending", icon: "🍩", description: "Spending breakdown by category" },
  {
    id: "budget-analysis",
    label: "Budget vs Actual",
    icon: "📊",
    description: "Budgeted vs actual spending per category",
  },
  {
    id: "age-of-money",
    label: "Age of Money",
    icon: "⏰",
    description: "How many days your money lasts",
  },
  { id: "custom", label: "Custom Reports", icon: "🔧", description: "Build your own reports" },
];

const GRAPH_TYPES = [
  { value: "area", label: "Area Chart" },
  { value: "bar", label: "Bar Chart" },
  { value: "donut", label: "Donut Chart" },
  { value: "table", label: "Table" },
] as const;

export default function ReportsPage() {
  const [activeReport, setActiveReport] = createSignal<ReportId>("net-worth");

  // Lazy-load report data
  const [netWorthData, setNetWorthData] = createSignal<TimeSeriesPoint[]>([]);
  const [cashFlowData, setCashFlowData] = createSignal<BarGroup[]>([]);
  const [spendingData, setSpendingData] = createSignal<PieSlice[]>([]);
  const [budgetData, setBudgetData] = createSignal<BudgetPair[]>([]);
  const [ageOfMoney, setAgeOfMoney] = createSignal<number | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Custom reports state
  const [customReports, setCustomReports] = createSignal<CustomReport[]>([]);
  const [showCreateModal, setShowCreateModal] = createSignal(false);
  const [editingReport, setEditingReport] = createSignal<CustomReport | null>(null);

  // Create/edit form
  const [formName, setFormName] = createSignal("");
  const [formGraphType, setFormGraphType] = createSignal("area");
  const [formStartDate, setFormStartDate] = createSignal("");
  const [formEndDate, setFormEndDate] = createSignal("");
  const [formGroupBy, setFormGroupBy] = createSignal("");
  const [formColorScheme, setFormColorScheme] = createSignal({
    income: "#4ade80",
    expense: "#f87171",
    balance: "#60a5fa",
    background: "#1a1a2e",
  });

  // Custom report data (lazy loaded per-report)
  const [customReportData, _setCustomReportData] = createSignal<Record<string, any>>({});

  createEffect(() => {
    const report = activeReport();
    if (report === "custom") {
      void loadCustomReports();
    } else {
      void loadReport(report);
    }
  });

  async function loadReport(report: ReportId) {
    setLoading(true);
    setError(null);
    try {
      switch (report) {
        case "net-worth": {
          const res = await fetch("/api/reports/net-worth");
          if (res.ok) {
            const data = ((await res.json()) as any).points ?? [];
            setNetWorthData(data as TimeSeriesPoint[]);
          }
          break;
        }
        case "cash-flow": {
          const res = await fetch("/api/reports/cash-flow");
          if (res.ok) {
            const data = ((await res.json()) as any).months ?? [];
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
            const data = ((await res.json()) as any).categories ?? [];
            setSpendingData(data as PieSlice[]);
          }
          break;
        }
        case "budget-analysis": {
          const res = await fetch("/api/reports/budget-analysis");
          if (res.ok) {
            const data = ((await res.json()) as any).categories ?? [];
            setBudgetData(data as BudgetPair[]);
          }
          break;
        }
        case "age-of-money": {
          const res = await fetch("/api/reports/age-of-money");
          if (res.ok) {
            const data = (await res.json()) as any;
            setAgeOfMoney(data.days ?? null);
          }
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load report`);
    } finally {
      setLoading(false);
    }
  }

  const formatMonth = (dateStr: string) => {
    if (!dateStr || dateStr.length < 7) return dateStr;
    const [y, m] = dateStr.split("-");
    const d = new Date(Number(y), Number(m) - 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  // -----------------------------------------------------------------------
  // Custom reports
  // -----------------------------------------------------------------------

  async function loadCustomReports() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/custom");
      if (res.ok) {
        const data = (await res.json()) as any;
        setCustomReports(data.reports ?? []);
      } else {
        setError(`Failed to load custom reports (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load custom reports");
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingReport(null);
    setFormName("");
    setFormGraphType("area");
    setFormStartDate("");
    setFormEndDate("");
    setFormGroupBy("");
    setFormColorScheme({
      income: "#4ade80",
      expense: "#f87171",
      balance: "#60a5fa",
      background: "#1a1a2e",
    });
    setShowCreateModal(true);
  }

  function openEditModal(report: CustomReport) {
    setEditingReport(report);
    setFormName(report.name ?? "");
    setFormGraphType(report.graph_type ?? "area");
    setFormStartDate(report.start_date ?? "");
    setFormEndDate(report.end_date ?? "");
    setFormGroupBy(report.group_by ?? "");
    try {
      const meta = report.metadata ? (JSON.parse(report.metadata) as any) : null;
      if (meta?.colors) {
        setFormColorScheme({
          income: meta.colors.income ?? "#4ade80",
          expense: meta.colors.expense ?? "#f87171",
          balance: meta.colors.balance ?? "#60a5fa",
          background: meta.colors.background ?? "#1a1a2e",
        });
      } else {
        setFormColorScheme({
          income: "#4ade80",
          expense: "#f87171",
          balance: "#60a5fa",
          background: "#1a1a2e",
        });
      }
    } catch {
      setFormColorScheme({
        income: "#4ade80",
        expense: "#f87171",
        balance: "#60a5fa",
        background: "#1a1a2e",
      });
    }
    setShowCreateModal(true);
  }

  function handleSaveReport() {
    const name = formName().trim();
    if (!name) return;

    if (editingReport()) {
      dispatch("update_report", {
        id: editingReport()!.id,
        fields: {
          name: formName(),
          graphType: formGraphType(),
          startDate: formStartDate() || null,
          endDate: formEndDate() || null,
          groupBy: formGroupBy() || null,
          metadata: JSON.stringify({ colors: formColorScheme() }),
        },
      });
    } else {
      dispatch("create_report", {
        report: {
          name: formName(),
          graphType: formGraphType(),
          startDate: formStartDate() || null,
          endDate: formEndDate() || null,
          groupBy: formGroupBy() || null,
          conditions: [],
          metadata: JSON.stringify({ colors: formColorScheme() }),
        },
      });
    }

    setShowCreateModal(false);
    setTimeout(() => loadCustomReports(), 300);
  }

  function handleDeleteReport(id: string) {
    dispatch("delete_report", { id });
    setTimeout(() => loadCustomReports(), 300);
  }

  async function loadCustomReportData(reportId: string) {
    try {
      const res = await fetch(`/api/reports/custom/${reportId}/execute`);
      if (res.ok) {
        const data = await res.json();
        _setCustomReportData((prev) => ({ ...prev, [reportId]: data }));
      }
    } catch {
      /* ignore */
    }
  }

  function renderCustomReportTable(
    rows: Array<Record<string, unknown>>,
    colors: Record<string, string> | undefined,
  ) {
    if (rows.length === 0) return <div class="chart-placeholder">No data</div>;

    const keys = Object.keys(rows[0]);
    const bg = colors?.background ?? "var(--surface)";

    return (
      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              {keys.map((key) => (
                <th>{key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <For each={rows}>
              {(row) => {
                const amount = Number(row.total ?? row.amount ?? 0);
                const isIncome = amount > 0;
                const isExpense = amount < 0;
                const cellStyle = isIncome
                  ? { color: colors?.income ?? "var(--positive)" }
                  : isExpense
                    ? { color: colors?.expense ?? "var(--negative)" }
                    : {};
                return (
                  <tr>
                    <For each={keys}>
                      {(key) => (
                        <td
                          style={
                            (key === "total" || key === "amount") && (isIncome || isExpense)
                              ? cellStyle
                              : {}
                          }
                        >
                          {(key === "total" || key === "amount") && row[key] !== undefined
                            ? formatCents(row[key] as number)
                            : key === "cleared"
                              ? row[key]
                                ? "✓"
                                : ""
                              : key === "reconciled"
                                ? row[key]
                                  ? "🔒"
                                  : ""
                                : String(row[key] ?? "")}
                        </td>
                      )}
                    </For>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>
    );
  }

  function renderCustomReport(report: CustomReport) {
    const graphType = report.graph_type ?? "area";
    const result = customReportData()[report.id] as any;
    const rows = result?.rows ?? [];
    const groupBy = result?.groupBy ?? null;
    let colors: Record<string, string> | undefined;
    try {
      const meta = report.metadata ? (JSON.parse(report.metadata) as any) : null;
      colors = meta?.colors;
    } catch {
      /* ignore */
    }

    if (!result) {
      return (
        <div class="chart-placeholder">
          <button class="btn btn-secondary btn-sm" onClick={() => loadCustomReportData(report.id)}>
            Load Data
          </button>
        </div>
      );
    }
    if (rows.length === 0) {
      return <div class="chart-placeholder">No matching transactions</div>;
    }

    // Table mode
    if (graphType === "table") {
      return <Show when={true}>{renderCustomReportTable(rows, colors)}</Show>;
    }

    // Area chart (time series from grouped data or individual txns)
    if (graphType === "area") {
      let points: TimeSeriesPoint[];
      if (groupBy === "month") {
        points = rows.map((r: any) => ({ date: r.month, value: r.total }));
      } else if (groupBy === "category") {
        points = rows.map((r: any) => ({
          date: r.category,
          value: r.total,
          label: r.category,
        }));
      } else {
        points = rows.map((r: any) => ({ date: r.date, value: r.amount }));
      }
      return (
        <AreaChart
          data={points}
          dimensions={{ width: 700, height: 300, marginBottom: 40 }}
          fillColor={colors?.balance ?? colors?.expense}
          strokeColor={colors?.balance ?? colors?.expense}
        />
      );
    }

    // Bar chart
    if (graphType === "bar") {
      let groups: BarGroup[];
      if (groupBy === "month") {
        groups = rows.map((r: any) => ({
          category: r.month,
          values: [{ label: "Total", value: r.total, color: colors?.balance ?? "var(--primary)" }],
        }));
      } else if (groupBy === "category") {
        groups = rows.map((r: any) => ({
          category: r.category,
          values: [{ label: "Total", value: r.total, color: colors?.balance ?? "var(--primary)" }],
        }));
      } else {
        const dateGroups: Record<string, number> = {};
        for (const r of rows) {
          dateGroups[r.date ?? "?"] = (dateGroups[r.date ?? "?"] ?? 0) + (r.amount ?? 0);
        }
        groups = Object.entries(dateGroups).map(([date, val]) => ({
          category: date,
          values: [{ label: "Total", value: val, color: colors?.balance ?? "var(--primary)" }],
        }));
      }
      return (
        <BarChart
          groups={groups}
          stacked={false}
          dimensions={{ width: 700, height: 300, marginBottom: 40 }}
          formatX={formatMonth}
        />
      );
    }

    // Donut chart (categories only)
    if (graphType === "donut") {
      let slices: PieSlice[];
      if (groupBy === "category") {
        slices = rows.map((r: any, i: number) => ({
          label: r.category,
          value: Math.abs(r.total),
          color: categoryColor(i),
        }));
      } else {
        const catMap: Record<string, number> = {};
        for (const r of rows) {
          const cat = (r.category ?? "Uncategorized") as string;
          catMap[cat] = (catMap[cat] ?? 0) + Math.abs(r.amount ?? 0);
        }
        let i = 0;
        slices = Object.entries(catMap).map(([label, value]) => ({
          label,
          value,
          color: categoryColor(i++),
        }));
      }
      return <DonutChart slices={slices} dimensions={{ width: 500, height: 350 }} />;
    }

    return <div class="chart-placeholder">Unsupported graph type</div>;
  }

  function categoryColor(index: number): string {
    const palette = [
      "#6366f1",
      "#22c55e",
      "#f59e0b",
      "#ef4444",
      "#a78bfa",
      "#06b6d4",
      "#f97316",
      "#84cc16",
      "#ec4899",
      "#14b8a6",
    ];
    return palette[index % palette.length];
  }

  function formatCents(cents: number): string {
    const sign = cents < 0 ? "-" : "";
    return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
  }

  return (
    <div class="page">
      <h1 class="page-title">Reports</h1>
      <p class="page-subtitle">Visualize your financial data</p>

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

      <div class="report-content">
        <Show
          when={activeReport() !== "custom"}
          fallback={
            <PageState
              loading={loading()}
              error={error()}
              onRetry={loadCustomReports}
              loadingMessage="Loading custom reports..."
            >
              <div class="page-header" style={{ "margin-bottom": "12px" }}>
                <p class="page-subtitle">Create and manage your own custom reports</p>
                <button class="btn btn-primary btn-sm" onClick={openCreateModal}>
                  + New Report
                </button>
              </div>

              <Show
                when={customReports().length > 0}
                fallback={
                  <div class="empty-state">
                    <p>No custom reports yet.</p>
                    <button class="btn btn-primary btn-sm" onClick={openCreateModal}>
                      Create your first report
                    </button>
                  </div>
                }
              >
                <div class="custom-report-list">
                  <For each={customReports()}>
                    {(report) => (
                      <div class="custom-report-card">
                        <div class="custom-report-header">
                          <div>
                            <strong>{report.name ?? "Untitled Report"}</strong>
                            <span class="custom-report-meta">
                              {report.graph_type ?? "area"} &middot; {report.start_date ?? "any"} to{" "}
                              {report.end_date ?? "any"}
                            </span>
                          </div>
                          <div class="custom-report-actions">
                            <button
                              class="btn btn-ghost btn-xs"
                              onClick={() => openEditModal(report)}
                            >
                              Edit
                            </button>
                            <button
                              class="btn btn-ghost btn-xs"
                              onClick={() => {
                                if (confirm("Delete this report?")) handleDeleteReport(report.id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div class="custom-report-body">{renderCustomReport(report)}</div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </PageState>
          }
        >
          <PageState
            loading={loading()}
            error={error()}
            onRetry={() => loadReport(activeReport())}
            loadingMessage="Loading report data..."
          >
            <Show when={activeReport() === "net-worth"}>
              <div class="report-card">
                <h2 class="report-title">Net Worth Over Time</h2>
                <p class="report-description">
                  Your total assets minus liabilities, tracked monthly.
                </p>
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
                <DonutChart slices={spendingData()} dimensions={{ width: 500, height: 350 }} />
              </div>
            </Show>

            <Show when={activeReport() === "budget-analysis"}>
              <div class="report-card">
                <h2 class="report-title">Budget vs Actuals</h2>
                <p class="report-description">How each category compares to its budget.</p>
                <BudgetBar data={budgetData()} maxCategories={15} />
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
                    fallback={
                      <span style={{ color: "var(--text-muted)" }}>
                        Not enough data to calculate
                      </span>
                    }
                  >
                    <span class="age-number" style={{ "font-size": "3rem", "font-weight": 700 }}>
                      {ageOfMoney()}
                    </span>
                    <span
                      class="age-unit"
                      style={{
                        "font-size": "1rem",
                        color: "var(--text-secondary)",
                        "margin-left": "8px",
                      }}
                    >
                      days
                    </span>
                  </Show>
                </div>
              </div>
            </Show>
          </PageState>
        </Show>
      </div>

      <Show when={showCreateModal()}>
        <div class="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h2>{editingReport() ? "Edit Report" : "New Custom Report"}</h2>
              <button class="modal-close" onClick={() => setShowCreateModal(false)}>
                &times;
              </button>
            </div>
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Report Name</label>
                  <input
                    type="text"
                    placeholder="My Custom Report"
                    value={formName()}
                    onInput={(e) => setFormName(e.currentTarget.value)}
                  />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Graph Type</label>
                  <select
                    value={formGraphType()}
                    onChange={(e) => setFormGraphType(e.currentTarget.value)}
                  >
                    <For each={GRAPH_TYPES}>
                      {(gt) => <option value={gt.value}>{gt.label}</option>}
                    </For>
                  </select>
                </div>
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Group By</label>
                  <select
                    value={formGroupBy()}
                    onChange={(e) => setFormGroupBy(e.currentTarget.value)}
                  >
                    <option value="">None (individual txns)</option>
                    <option value="month">Month</option>
                    <option value="category">Category</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={formStartDate()}
                    onInput={(e) => setFormStartDate(e.currentTarget.value)}
                  />
                </div>
                <div class="form-group" style={{ flex: "1" }}>
                  <label>End Date</label>
                  <input
                    type="date"
                    value={formEndDate()}
                    onInput={(e) => setFormEndDate(e.currentTarget.value)}
                  />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Income Color</label>
                  <div class="form-color">
                    <input
                      type="color"
                      value={formColorScheme().income}
                      onInput={(e) =>
                        setFormColorScheme({ ...formColorScheme(), income: e.currentTarget.value })
                      }
                    />
                    <code>{formColorScheme().income}</code>
                  </div>
                </div>
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Expense Color</label>
                  <div class="form-color">
                    <input
                      type="color"
                      value={formColorScheme().expense}
                      onInput={(e) =>
                        setFormColorScheme({ ...formColorScheme(), expense: e.currentTarget.value })
                      }
                    />
                    <code>{formColorScheme().expense}</code>
                  </div>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Balance Color</label>
                  <div class="form-color">
                    <input
                      type="color"
                      value={formColorScheme().balance}
                      onInput={(e) =>
                        setFormColorScheme({ ...formColorScheme(), balance: e.currentTarget.value })
                      }
                    />
                    <code>{formColorScheme().balance}</code>
                  </div>
                </div>
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Background Color</label>
                  <div class="form-color">
                    <input
                      type="color"
                      value={formColorScheme().background}
                      onInput={(e) =>
                        setFormColorScheme({
                          ...formColorScheme(),
                          background: e.currentTarget.value,
                        })
                      }
                    />
                    <code>{formColorScheme().background}</code>
                  </div>
                </div>
              </div>
              <div class="form-actions">
                <button class="btn btn-ghost" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button
                  class="btn btn-primary"
                  onClick={handleSaveReport}
                  disabled={!formName().trim()}
                >
                  {editingReport() ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
