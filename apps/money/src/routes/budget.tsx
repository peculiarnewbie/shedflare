/**
 * Budget page — month grid showing categories × budgeted/spent/leftover.
 */
import { createMemo, createSignal, For, Show, createEffect } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { dispatch } from "../lib/pending-ops";
import { usePrivacyMode } from "../lib/privacy";
import { useDateFormat } from "../lib/date-format";

interface CategoryBudgetRow {
  categoryId: string;
  categoryName: string;
  groupName: string | null;
  budgeted: number;
  spent: number;
  leftover: number;
  leftoverPos: number;
  carryover: boolean;
}

interface GroupedBudget {
  groupName: string | null;
  categories: CategoryBudgetRow[];
  groupBudgeted: number;
  groupSpent: number;
  groupLeftover: number;
}

export default function BudgetPage() {
  const navigate = useNavigate();
  const privacyBlur = usePrivacyMode();
  const df = useDateFormat();
  const now = new Date();
  const [monthKey, setMonthKey] = createSignal(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [categories, setCategories] = createSignal<CategoryBudgetRow[]>([]);
  const [toBudget, setToBudget] = createSignal(0);
  const [loading, setLoading] = createSignal(true);

  // Load budget data
  createEffect(() => {
    setLoading(true);
    void loadBudget();
  });

  async function loadBudget() {
    try {
      const mk = monthKey();
      const [y, m] = mk.split("-").map(Number);
      const monthInt = y * 100 + m;
      const res = await fetch(`/api/budget/${monthInt}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        setCategories(data.categories ?? []);
        setToBudget(data.toBudget ?? 0);
      }
    } catch {
      // Will work once sync is connected
    } finally {
      setLoading(false);
    }
  }

  // Group categories
  const grouped = createMemo((): GroupedBudget[] => {
    const groups = new Map<string | null, CategoryBudgetRow[]>();
    for (const cat of categories()) {
      const g = cat.groupName ?? "Uncategorized";
      const list = groups.get(g) ?? [];
      list.push(cat);
      groups.set(g, list);
    }

    return Array.from(groups.entries()).map(([name, cats]) => ({
      groupName: name,
      categories: cats,
      groupBudgeted: cats.reduce((s, c) => s + c.budgeted, 0),
      groupSpent: cats.reduce((s, c) => s + c.spent, 0),
      groupLeftover: cats.reduce((s, c) => s + c.leftover, 0),
    }));
  });

  function prevMonth() {
    const [y, m] = monthKey().split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  function nextMonth() {
    const [y, m] = monthKey().split("-").map(Number);
    const d = new Date(y, m, 1);
    setMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  async function setBudget(categoryId: string, amount: number) {
    const [y, m] = monthKey().split("-").map(Number);
    const monthInt = y * 100 + m;
    dispatch("set_budget_amount", { month: monthInt, categoryId, amount });
    // Optimistic update
    setCategories((prev) =>
      prev.map((c) => (c.categoryId === categoryId ? { ...c, budgeted: amount } : c)),
    );
  }

  function formatCents(cents: number): string {
    const abs = Math.abs(cents);
    return `${cents < 0 ? "-" : ""}$${(abs / 100).toFixed(2)}`;
  }

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Budget</h1>
        <div class="month-nav">
          <button class="btn btn-icon btn-ghost" onClick={prevMonth}>
            ◀
          </button>
          <span class="month-label">{df().formatMonth(monthKey())}</span>
          <button class="btn btn-icon btn-ghost" onClick={nextMonth}>
            ▶
          </button>
        </div>
      </div>

      <div class="budget-summary">
        <div class="summary-item">
          <span class="summary-label">To Budget</span>
          <span
            class={`summary-value ${privacyBlur().blurClass()}`}
            classList={{ positive: toBudget() >= 0, negative: toBudget() < 0 }}
          >
            {formatCents(toBudget())}
          </span>
        </div>
      </div>

      <Show when={!loading()} fallback={<div class="loading">Loading budget...</div>}>
        <Show
          when={grouped().length > 0}
          fallback={
            <div class="empty-state">
              <p>No categories yet.</p>
              <p>You need categories before you can budget.</p>
              <button class="btn btn-primary" onClick={() => navigate("/categories")}>
                Go to Categories
              </button>
            </div>
          }
        >
          <div class="budget-table">
            <div class="budget-table-header">
              <span class="col-category">Category</span>
              <span class="col-budgeted">Budgeted</span>
              <span class="col-spent">Spent</span>
              <span class="col-leftover">Leftover</span>
            </div>

            <For each={grouped()}>
              {(group) => (
                <div class="budget-group">
                  <div class="budget-group-title">{group.groupName}</div>
                  <For each={group.categories}>
                    {(cat) => (
                      <div class="budget-row">
                        <span class="col-category">{cat.categoryName}</span>
                        <span class="col-budgeted">
                          <input
                            type="number"
                            value={cat.budgeted / 100}
                            step="0.01"
                            class="budget-input"
                            onBlur={(e) => {
                              const val = parseFloat(e.currentTarget.value);
                              if (!isNaN(val))
                                void setBudget(cat.categoryId, Math.round(val * 100));
                            }}
                          />
                        </span>
                        <span class={`col-spent ${privacyBlur().blurClass()}`}>
                          {formatCents(cat.spent)}
                        </span>
                        <span
                          class={`col-leftover ${privacyBlur().blurClass()}`}
                          classList={{
                            positive: cat.leftover >= 0,
                            negative: cat.leftover < 0,
                          }}
                        >
                          {formatCents(cat.leftover)}
                        </span>
                      </div>
                    )}
                  </For>
                  <div class="budget-row budget-group-total">
                    <span class="col-category">
                      <strong>Group Total</strong>
                    </span>
                    <span class={`col-budgeted ${privacyBlur().blurClass()}`}>
                      <strong>{formatCents(group.groupBudgeted)}</strong>
                    </span>
                    <span class={`col-spent ${privacyBlur().blurClass()}`}>
                      <strong>{formatCents(group.groupSpent)}</strong>
                    </span>
                    <span class={`col-leftover ${privacyBlur().blurClass()}`}>
                      <strong>{formatCents(group.groupLeftover)}</strong>
                    </span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
