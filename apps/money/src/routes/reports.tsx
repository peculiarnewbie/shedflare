import { createSignal, createResource, createEffect, For, Show } from "solid-js";
import { AreaChart, BarChart, DonutChart, BudgetBar } from "../charts";
import type { TimeSeriesPoint, BarGroup, PieSlice, BudgetPair } from "../charts";
import { dispatch } from "../lib/pending-ops";
import { createId } from "../domain/types";

type ReportId = "net-worth" | "cash-flow" | "spending" | "budget-analysis" | "age-of-money" | "custom";

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

  // Custom reports state
  const [customReports, setCustomReports] = createSignal<CustomReport[]>([]);
  const [showCreateModal, setShowCreateModal] = createSignal(false);
  const [editingReport, setEditingReport] = createSignal<CustomReport | null>(null);

  // Create/edit form
  const [formName, setFormName] = createSignal("");
  const [formGraphType, setFormGraphType] = createSignal("area");
  const [formStartDate, setFormStartDate] = createSignal("");
  const [formEndDate, setFormEndDate] = createSignal("");

  // Custom report data (lazy loaded per-report)
  const [customReportData, setCustomReportData] = createSignal<Record<string, any>>({});

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
    } catch {
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
    try {
      const res = await fetch("/api/reports/custom");
      if (res.ok) {
        const data = (await res.json()) as any;
        setCustomReports(data.reports ?? []);
      }
    } catch {
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
    setShowCreateModal(true);
  }

  function openEditModal(report: CustomReport) {
    setEditingReport(report);
    setFormName(report.name ?? "");
    setFormGraphType(report.graph_type ?? "area");
    setFormStartDate(report.start_date ?? "");
    setFormEndDate(report.end_date ?? "");
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
        },
      });
    } else {
      dispatch("create_report", {
        report: {
          name: formName(),
          graphType: formGraphType(),
          startDate: formStartDate() || null,
          endDate: formEndDate() || null,
          conditions: [],
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

  function fetchReportData(reportId: string) {
    void (async () => {
      try {
        const res = await fetch(`/api/transactions`);
        if (res.ok) {
          const data = (await res.json()) as any;
          setCustomReportData((prev) => ({ ...prev, [reportId]: data.transactions ?? [] }));
        }
      } catch {
      }
    })();
  }

  function renderCustomReport(report: CustomReport) {
    const graphType = report.graph_type ?? "area";
    const data = customReportData()[report.id] ?? [];
    if (data.length === 0) {
      return <div class="chart-placeholder">Load report data to view</div>;
    }
    const name = report.name ?? "Custom Report";
    return (
      <Show when={graphType === "area"}>
        <AreaChart
          data={data.map((t: any) => ({ date: t.date, value: t.amount }))}
          dimensions={{ width: 700, height: 300, marginBottom: 40 }}
        />
      </Show>
    );
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
        <Show when={activeReport() !== "custom"} fallback={
          <Show when={!loading()} fallback={<div class="loading">Loading custom reports...</div>}>
            <div class="page-header" style={{ "margin-bottom": "12px" }}>
              <p class="page-subtitle">Create and manage your own custom reports</p>
              <button class="btn btn-primary btn-sm" onClick={openCreateModal}>
                + New Report
              </button>
            </div>

            <Show when={customReports().length > 0} fallback={
              <div class="empty-state">
                <p>No custom reports yet.</p>
                <button class="btn btn-primary btn-sm" onClick={openCreateModal}>
                  Create your first report
                </button>
              </div>
            }>
              <div class="custom-report-list">
                <For each={customReports()}>
                  {(report) => (
                    <div class="custom-report-card">
                      <div class="custom-report-header">
                        <div>
                          <strong>{report.name ?? "Untitled Report"}</strong>
                          <span class="custom-report-meta">
                            {report.graph_type ?? "area"} &middot; {report.start_date ?? "any"} to {report.end_date ?? "any"}
                          </span>
                        </div>
                        <div class="custom-report-actions">
                          <button class="btn btn-ghost btn-xs" onClick={() => openEditModal(report)}>
                            Edit
                          </button>
                          <button class="btn btn-ghost btn-xs" onClick={() => {
                            if (confirm("Delete this report?")) handleDeleteReport(report.id);
                          }}>
                            Delete
                          </button>
                        </div>
                      </div>
                      <div class="custom-report-body">
                        {renderCustomReport(report)}
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        }>
          <Show when={!loading()} fallback={<div class="loading">Loading report data...</div>}>
            <Show when={activeReport() === "net-worth"}>
              <div class="report-card">
                <h2 class="report-title">Net Worth Over Time</h2>
                <p class="report-description">Your total assets minus liabilities, tracked monthly.</p>
                <AreaChart data={netWorthData()} dimensions={{ width: 700, height: 300, marginBottom: 40 }} />
              </div>
            </Show>

            <Show when={activeReport() === "cash-flow"}>
              <div class="report-card">
                <h2 class="report-title">Cash Flow</h2>
                <p class="report-description">Income versus expenses by month.</p>
                <BarChart groups={cashFlowData()} stacked={false} dimensions={{ width: 700, height: 300, marginBottom: 40 }} formatX={formatMonth} />
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
                <p class="report-description">How many days your current cash would last based on average daily spending.</p>
                <div class="age-display" style={{ padding: "32px" }}>
                  <Show when={ageOfMoney() !== null} fallback={
                    <span style={{ color: "var(--text-muted)" }}>Not enough data to calculate</span>
                  }>
                    <span class="age-number" style={{ "font-size": "3rem", "font-weight": 700 }}>{ageOfMoney()}</span>
                    <span class="age-unit" style={{ "font-size": "1rem", color: "var(--text-secondary)", "margin-left": "8px" }}>days</span>
                  </Show>
                </div>
              </div>
            </Show>
          </Show>
        </Show>
      </div>

      <Show when={showCreateModal()}>
        <div class="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h2>{editingReport() ? "Edit Report" : "New Custom Report"}</h2>
              <button class="modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
            </div>
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Report Name</label>
                  <input type="text" placeholder="My Custom Report" value={formName()} onInput={(e) => setFormName(e.currentTarget.value)} />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Graph Type</label>
                  <select value={formGraphType()} onChange={(e) => setFormGraphType(e.currentTarget.value)}>
                    <For each={GRAPH_TYPES}>
                      {(gt) => <option value={gt.value}>{gt.label}</option>}
                    </For>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style={{ flex: "1" }}>
                  <label>Start Date</label>
                  <input type="date" value={formStartDate()} onInput={(e) => setFormStartDate(e.currentTarget.value)} />
                </div>
                <div class="form-group" style={{ flex: "1" }}>
                  <label>End Date</label>
                  <input type="date" value={formEndDate()} onInput={(e) => setFormEndDate(e.currentTarget.value)} />
                </div>
              </div>
              <div class="form-actions">
                <button class="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button class="btn btn-primary" onClick={handleSaveReport} disabled={!formName().trim()}>
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
