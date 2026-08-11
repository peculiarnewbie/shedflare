import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../lib/api";
import { useCurrency } from "../lib/currency";
import { useDateFormat } from "../lib/date-format";
import { usePrivacyMode } from "../lib/privacy";
import { PageState } from "../components/PageState";
import { useMoneyShell } from "../components/MoneyShellContext";
import { listenForMoneyDataChanged } from "../lib/data-events";
import type {
  BudgetOverview,
  MonthBudget,
  SchedulesResponse,
  TransactionsResponse,
} from "../domain/schemas-client";

type Transaction = TransactionsResponse["transactions"][number];
type Schedule = SchedulesResponse["schedules"][number];
type BudgetCategory = MonthBudget["categories"][number];

function currentMonthInt(): number {
  const now = new Date();
  return now.getFullYear() * 100 + now.getMonth() + 1;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const shell = useMoneyShell();
  const fmt = useCurrency();
  const df = useDateFormat();
  const privacy = usePrivacyMode();
  const [overview, setOverview] = createSignal<BudgetOverview | null>(null);
  const [monthBudget, setMonthBudget] = createSignal<MonthBudget | null>(null);
  const [transactions, setTransactions] = createSignal<Transaction[]>([]);
  const [schedules, setSchedules] = createSignal<Schedule[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  async function loadDashboard(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, budgetData, transactionData, scheduleData] = await Promise.all([
        api.budgetOverview(),
        api.budgetMonth(currentMonthInt()),
        api.transactions(),
        api.schedules(),
      ]);
      setOverview(overviewData);
      setMonthBudget(budgetData);
      setTransactions(transactionData.transactions.filter((transaction) => !transaction.isChild));
      setSchedules([...scheduleData.schedules]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your financial overview");
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    void loadDashboard();
    onCleanup(listenForMoneyDataChanged(loadDashboard));
  });

  const uncategorized = createMemo(() =>
    transactions().filter((transaction) => transaction.categoryId === null),
  );
  const overspent = createMemo(() =>
    (monthBudget()?.categories ?? [])
      .filter((category) => category.leftover < 0)
      .sort((left, right) => left.leftover - right.leftover)
      .slice(0, 4),
  );
  const upcoming = createMemo(() =>
    schedules()
      .filter((schedule) => !schedule.completed && schedule.nextDate)
      .sort((left, right) => (left.nextDate ?? "").localeCompare(right.nextDate ?? ""))
      .slice(0, 4),
  );
  const recent = createMemo(() => transactions().slice(0, 6));

  const metricCards = createMemo(() => {
    const data = overview();
    const budget = monthBudget();
    if (!data || !budget) return [];
    return [
      {
        label: "Net worth",
        value: data.netWorth,
        tone: data.netWorth >= 0 ? "positive" : "negative",
      },
      {
        label: "Ready to budget",
        value: budget.toBudget,
        tone: budget.toBudget >= 0 ? "positive" : "negative",
      },
      { label: "Income this month", value: data.income, tone: "positive" },
      { label: "Spent this month", value: Math.abs(data.expense), tone: "neutral" },
    ] as const;
  });

  return (
    <div class="page overview-page">
      <div class="overview-hero">
        <div>
          <p class="eyebrow">Today</p>
          <h1 class="page-title">Your money at a glance</h1>
          <p class="page-subtitle page-subtitle-compact">
            What needs attention, followed by your latest activity.
          </p>
        </div>
        <button
          type="button"
          class="btn btn-primary overview-add"
          onClick={() => shell.openTransaction()}
        >
          + Add transaction
        </button>
      </div>

      <PageState
        loading={loading()}
        error={error()}
        onRetry={loadDashboard}
        loadingMessage="Loading your money…"
      >
        <Show when={overview() && monthBudget()}>
          <section class="overview-metrics" aria-label="Financial summary">
            <For each={metricCards()}>
              {(metric) => (
                <div class="overview-metric">
                  <span class="overview-metric-label">{metric.label}</span>
                  <strong
                    class={`overview-metric-value ${privacy().blurClass()}`}
                    classList={{
                      positive: metric.tone === "positive",
                      negative: metric.tone === "negative",
                    }}
                  >
                    {fmt().formatCents(metric.value)}
                  </strong>
                </div>
              )}
            </For>
          </section>

          <section class="overview-section">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Attention</p>
                <h2>Things to take care of</h2>
              </div>
            </div>
            <div class="attention-grid">
              <button
                type="button"
                class="attention-card"
                onClick={() => navigate("/transactions?view=uncategorized")}
              >
                <span class="attention-count">{uncategorized().length}</span>
                <span class="attention-copy">
                  <strong>Uncategorized transactions</strong>
                  <small>
                    {uncategorized().length ? "Review and assign them" : "Everything is organized"}
                  </small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
              <button type="button" class="attention-card" onClick={() => navigate("/budget")}>
                <span class="attention-count">{overspent().length}</span>
                <span class="attention-copy">
                  <strong>Overspent categories</strong>
                  <small>
                    {overspent().length ? "Adjust this month’s plan" : "Your plan is on track"}
                  </small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
              <button type="button" class="attention-card" onClick={() => navigate("/schedules")}>
                <span class="attention-count">{upcoming().length}</span>
                <span class="attention-copy">
                  <strong>Upcoming schedules</strong>
                  <small>
                    {upcoming()[0]?.nextDate
                      ? `Next on ${df().formatDate(upcoming()[0].nextDate ?? "")}`
                      : "Nothing coming up"}
                  </small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>

          <div class="overview-columns">
            <section class="overview-panel">
              <div class="section-heading">
                <h2>Recent activity</h2>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  onClick={() => navigate("/transactions")}
                >
                  View all
                </button>
              </div>
              <Show
                when={recent().length}
                fallback={<p class="empty-inline">No transactions yet.</p>}
              >
                <div class="activity-list">
                  <For each={recent()}>
                    {(transaction) => (
                      <button
                        type="button"
                        class="activity-row"
                        onClick={() =>
                          navigate(
                            `/transactions?q=${encodeURIComponent(transaction.payee ?? transaction.notes ?? transaction.date)}`,
                          )
                        }
                      >
                        <span class="activity-date">{df().formatDate(transaction.date)}</span>
                        <span class="activity-copy">
                          <strong>{transaction.payee ?? "No payee"}</strong>
                          <small>{transaction.categoryName ?? "Uncategorized"}</small>
                        </span>
                        <span
                          class={`activity-amount ${privacy().blurClass()}`}
                          classList={{
                            positive: transaction.amount > 0,
                            negative: transaction.amount < 0,
                          }}
                        >
                          {fmt().formatCents(transaction.amount)}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section class="overview-panel">
              <div class="section-heading">
                <h2>Budget pressure</h2>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  onClick={() => navigate("/budget")}
                >
                  Open budget
                </button>
              </div>
              <Show
                when={overspent().length}
                fallback={<p class="empty-inline">No categories are overspent.</p>}
              >
                <div class="activity-list">
                  <For each={overspent()}>
                    {(category: BudgetCategory) => (
                      <button
                        type="button"
                        class="activity-row"
                        onClick={() =>
                          navigate(`/budget?category=${encodeURIComponent(category.categoryId)}`)
                        }
                      >
                        <span class="activity-copy">
                          <strong>{category.categoryName}</strong>
                          <small>{category.groupName ?? "Uncategorized"}</small>
                        </span>
                        <span class={`activity-amount negative ${privacy().blurClass()}`}>
                          {fmt().formatCents(category.leftover)}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              <button type="button" class="reports-link" onClick={() => navigate("/reports")}>
                Looking for charts? Open Reports <span aria-hidden="true">→</span>
              </button>
            </section>
          </div>
        </Show>
      </PageState>
    </div>
  );
}
