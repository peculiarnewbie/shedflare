/**
 * Dashboard — overview with net worth, cash flow, budget health.
 */
import { createMemo, createEffect, createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";

export default function Dashboard() {
  const navigate = useNavigate();
  const [netWorth, setNetWorth] = createSignal<number>(0);
  const [monthIncome, setMonthIncome] = createSignal(0);
  const [monthExpense, setMonthExpense] = createSignal(0);
  const [accountCount, setAccountCount] = createSignal(0);
  const [onBudgetAmount, setOnBudgetAmount] = createSignal(0);

  // Load data on mount
  createEffect(() => {
    // Fetch from server until sync is wired up
    void loadDashboardData();
  });

  async function loadDashboardData() {
    try {
      const [sessionRes, budgetRes] = await Promise.all([
        fetch("/api/session"),
        fetch("/api/budget/overview"),
      ]);
      if (budgetRes.ok) {
        const data = (await budgetRes.json()) as any;
        setNetWorth(data.netWorth ?? 0);
        setMonthIncome(data.income ?? 0);
        setMonthExpense(data.expense ?? 0);
        setAccountCount(data.accountCount ?? 0);
        setOnBudgetAmount(data.onBudget ?? 0);
      }
    } catch {
      // Silently fail — will work once sync is connected
    }
  }

  return (
    <div class="page">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Your financial overview</p>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Net Worth</div>
          <div class="stat-value positive">
            ${(netWorth() / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">On Budget</div>
          <div class="stat-value positive">
            ${(onBudgetAmount() / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Accounts</div>
          <div class="stat-value">{accountCount()}</div>
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">This Month</h2>
        <div class="stats-grid">
          <div class="stat-card income">
            <div class="stat-label">Income</div>
            <div class="stat-value positive">
              ${(monthIncome() / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div class="stat-card expense">
            <div class="stat-label">Expenses</div>
            <div class="stat-value negative">
              ${(monthExpense() / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Balance</div>
            <div
              class="stat-value"
              classList={{
                positive: monthIncome() - monthExpense() >= 0,
                negative: monthIncome() - monthExpense() < 0,
              }}
            >
              $
              {((monthIncome() - monthExpense()) / 100).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>
      </div>

      <div class="quick-actions">
        <button class="btn btn-primary" onClick={() => navigate("/accounts")}>
          + Add Transaction
        </button>
        <button class="btn btn-secondary" onClick={() => navigate("/budget")}>
          Go to Budget
        </button>
      </div>
    </div>
  );
}
