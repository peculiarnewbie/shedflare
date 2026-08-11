import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { dispatch } from "../lib/pending-ops";
import { api } from "../lib/api";
import { usePrivacyMode } from "../lib/privacy";
import { useDateFormat } from "../lib/date-format";
import { useCurrency } from "../lib/currency";
import { PageState } from "../components/PageState";
import { listenForMoneyDataChanged } from "../lib/data-events";
import type {
  CategoriesResponse,
  CategoryGroupsResponse,
  MonthBudget,
} from "../domain/schemas-client";

type CategoryBudgetRow = MonthBudget["categories"][number];
type CategoryDefinition = CategoriesResponse["categories"][number];
type CategoryGroup = CategoryGroupsResponse["groups"][number];
type GoalType = "none" | "monthly" | "byDate" | "refill" | "periodic" | "percentage";

type GoalConfig = {
  type: Exclude<GoalType, "none">;
  amount?: number;
  targetDate?: string;
  frequency?: string;
  percentage?: number;
};

interface GroupedBudget {
  groupName: string | null;
  categories: CategoryBudgetRow[];
  groupBudgeted: number;
  groupSpent: number;
  groupLeftover: number;
}

function parseGoal(goalDef: string | null): GoalConfig | null {
  if (!goalDef) return null;
  try {
    const value = JSON.parse(goalDef) as unknown;
    if (!value || typeof value !== "object" || !("type" in value)) return null;
    return value as GoalConfig;
  } catch {
    return null;
  }
}

export default function BudgetPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams<{ category?: string }>();
  const privacy = usePrivacyMode();
  const df = useDateFormat();
  const fmt = useCurrency();
  const now = new Date();
  const [monthKey, setMonthKey] = createSignal(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [categories, setCategories] = createSignal<CategoryBudgetRow[]>([]);
  const [categoryDefinitions, setCategoryDefinitions] = createSignal<CategoryDefinition[]>([]);
  const [categoryGroups, setCategoryGroups] = createSignal<CategoryGroup[]>([]);
  const [toBudget, setToBudget] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [showNewCategory, setShowNewCategory] = createSignal(false);
  const [newCategoryName, setNewCategoryName] = createSignal("");
  const [newCategoryGroup, setNewCategoryGroup] = createSignal("");

  const [editName, setEditName] = createSignal("");
  const [editGroupId, setEditGroupId] = createSignal("");
  const [goalType, setGoalType] = createSignal<GoalType>("none");
  const [goalAmount, setGoalAmount] = createSignal("");
  const [goalTargetDate, setGoalTargetDate] = createSignal("");
  const [goalFrequency, setGoalFrequency] = createSignal("quarterly");
  const [goalPercentage, setGoalPercentage] = createSignal("");
  const [savingCategory, setSavingCategory] = createSignal(false);
  let categoryNameInput: HTMLInputElement | undefined;

  const selectedCategory = createMemo(() =>
    categoryDefinitions().find((category) => category.id === searchParams.category),
  );

  createEffect(() => {
    monthKey();
    void loadBudget();
  });

  onMount(() => {
    onCleanup(listenForMoneyDataChanged(loadBudget));
  });

  createEffect(() => {
    const category = selectedCategory();
    if (!category) return;
    const goal = parseGoal(category.goalDef);
    setEditName(category.name);
    setEditGroupId(category.groupId ?? "");
    setGoalType(goal?.type ?? "none");
    setGoalAmount(goal?.amount ? fmt().formatCentsInput(goal.amount) : "");
    setGoalTargetDate(goal?.targetDate ?? "");
    setGoalFrequency(goal?.frequency ?? "quarterly");
    setGoalPercentage(goal?.percentage ? String(goal.percentage) : "");
    queueMicrotask(() => categoryNameInput?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchParams({ category: undefined }, { replace: true });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  });

  async function loadBudget(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [year, month] = monthKey().split("-").map(Number);
      const [budgetData, categoryData, groupData] = await Promise.all([
        api.budgetMonth(year * 100 + month),
        api.categories(),
        api.categoryGroups(),
      ]);
      setCategories([...budgetData.categories]);
      setToBudget(budgetData.toBudget);
      setCategoryDefinitions([...categoryData.categories]);
      setCategoryGroups([...groupData.groups]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load budget");
    } finally {
      setLoading(false);
    }
  }

  const grouped = createMemo((): GroupedBudget[] => {
    const groups = new Map<string | null, CategoryBudgetRow[]>();
    for (const category of categories()) {
      const group = category.groupName ?? "Uncategorized";
      groups.set(group, [...(groups.get(group) ?? []), category]);
    }
    return Array.from(groups.entries()).map(([groupName, rows]) => ({
      groupName,
      categories: rows,
      groupBudgeted: rows.reduce((sum, category) => sum + category.budgeted, 0),
      groupSpent: rows.reduce((sum, category) => sum + category.spent, 0),
      groupLeftover: rows.reduce((sum, category) => sum + category.leftover, 0),
    }));
  });

  function moveMonth(offset: number): void {
    const [year, month] = monthKey().split("-").map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    setMonthKey(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  async function setBudget(categoryId: string, rawAmount: string): Promise<void> {
    const amount = fmt().parseInput(rawAmount);
    const [year, month] = monthKey().split("-").map(Number);
    const monthInt = year * 100 + month;
    const previous =
      categories().find((category) => category.categoryId === categoryId)?.budgeted ?? 0;
    setCategories((current) =>
      current.map((category) =>
        category.categoryId === categoryId ? { ...category, budgeted: amount } : category,
      ),
    );
    try {
      await dispatch(
        "set_budget_amount",
        { month: monthInt, categoryId, amount },
        {
          undoInfo: {
            label: "Update budget",
            inverse: {
              commandType: "set_budget_amount",
              payload: { month: monthInt, categoryId, amount: previous },
            },
          },
        },
      ).promise;
    } finally {
      await loadBudget();
    }
  }

  function buildGoalDefinition(): string | null {
    const type = goalType();
    if (type === "none") return null;
    if (type === "percentage") {
      const percentage = Number(goalPercentage());
      return percentage > 0 ? JSON.stringify({ type, percentage }) : null;
    }
    const amount = fmt().parseInput(goalAmount());
    if (amount <= 0) return null;
    const goal: GoalConfig = { type, amount };
    if ((type === "byDate" || type === "refill") && goalTargetDate()) {
      goal.targetDate = goalTargetDate();
    }
    if (type === "periodic") goal.frequency = goalFrequency();
    return JSON.stringify(goal);
  }

  async function saveCategory(event: Event): Promise<void> {
    event.preventDefault();
    const category = selectedCategory();
    const name = editName().trim();
    if (!category || !name) return;
    const nextGoal = buildGoalDefinition();
    setSavingCategory(true);
    try {
      await dispatch(
        "update_category",
        {
          id: category.id,
          name,
          groupId: editGroupId() || null,
          goalDef: nextGoal,
        },
        {
          undoInfo: {
            label: "Update category",
            inverse: {
              commandType: "update_category",
              payload: {
                id: category.id,
                name: category.name,
                groupId: category.groupId,
                goalDef: category.goalDef,
              },
            },
          },
        },
      ).promise;
      await loadBudget();
      setSearchParams({ category: undefined }, { replace: true });
    } finally {
      setSavingCategory(false);
    }
  }

  async function createCategory(event: Event): Promise<void> {
    event.preventDefault();
    const name = newCategoryName().trim();
    if (!name) return;
    await dispatch(
      "create_category",
      { name, groupId: newCategoryGroup() || null },
      {
        undoInfo: {
          label: "Create category",
          inverse: (data) => ({
            commandType: "delete_category",
            payload: { id: data.id as string },
          }),
        },
      },
    ).promise;
    setNewCategoryName("");
    setNewCategoryGroup("");
    setShowNewCategory(false);
    await loadBudget();
  }

  return (
    <div class="page budget-page">
      <div class="page-header budget-page-header">
        <div>
          <h1 class="page-title">Budget</h1>
          <p class="page-subtitle page-subtitle-compact">
            Plan, rename categories, and set goals in one place.
          </p>
        </div>
        <div class="budget-header-actions">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            onClick={() => setShowNewCategory(true)}
          >
            + Category
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={() => navigate("/categories")}
          >
            Advanced setup
          </button>
        </div>
      </div>

      <div class="budget-toolbar">
        <div class="month-nav">
          <button
            type="button"
            class="btn btn-icon btn-ghost"
            onClick={() => moveMonth(-1)}
            aria-label="Previous month"
          >
            ←
          </button>
          <span class="month-label">{df().formatMonth(monthKey())}</span>
          <button
            type="button"
            class="btn btn-icon btn-ghost"
            onClick={() => moveMonth(1)}
            aria-label="Next month"
          >
            →
          </button>
        </div>
        <div class="budget-ready">
          <span>Ready to budget</span>
          <strong
            class={privacy().blurClass()}
            classList={{ positive: toBudget() >= 0, negative: toBudget() < 0 }}
          >
            {fmt().formatCents(toBudget())}
          </strong>
        </div>
      </div>

      <PageState
        loading={loading()}
        error={error()}
        onRetry={loadBudget}
        loadingMessage="Loading budget…"
      >
        <Show
          when={grouped().length > 0}
          fallback={
            <div class="empty-state">
              <p>No categories yet.</p>
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => setShowNewCategory(true)}
              >
                Create your first category
              </button>
            </div>
          }
        >
          <div class="budget-table">
            <div class="budget-table-header" aria-hidden="true">
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
                    {(category) => (
                      <div class="budget-row">
                        <span class="col-category">
                          <button
                            type="button"
                            class="budget-category-button"
                            onClick={() =>
                              setSearchParams({ category: category.categoryId }, { replace: true })
                            }
                            aria-label={`Edit ${category.categoryName}`}
                          >
                            {category.categoryName}
                            <span aria-hidden="true">•••</span>
                          </button>
                        </span>
                        <span class={`col-budgeted ${privacy().blurClass()}`} data-label="Budgeted">
                          <input
                            type="number"
                            value={fmt().formatCentsInput(category.budgeted)}
                            step={fmt().code === "IDR" ? "1" : "0.01"}
                            class={`budget-input ${privacy().blurClass()}`}
                            aria-label={`Budgeted amount for ${category.categoryName}`}
                            onBlur={(event) =>
                              void setBudget(category.categoryId, event.currentTarget.value)
                            }
                          />
                        </span>
                        <span class={`col-spent ${privacy().blurClass()}`} data-label="Spent">
                          {fmt().formatCents(category.spent)}
                        </span>
                        <span
                          class={`col-leftover ${privacy().blurClass()}`}
                          classList={{
                            positive: category.leftover >= 0,
                            negative: category.leftover < 0,
                          }}
                          data-label="Leftover"
                        >
                          {fmt().formatCents(category.leftover)}
                        </span>
                      </div>
                    )}
                  </For>
                  <div class="budget-row budget-group-total">
                    <span class="col-category">
                      <strong>Group total</strong>
                    </span>
                    <span class={`col-budgeted ${privacy().blurClass()}`} data-label="Budgeted">
                      <strong>{fmt().formatCents(group.groupBudgeted)}</strong>
                    </span>
                    <span class={`col-spent ${privacy().blurClass()}`} data-label="Spent">
                      <strong>{fmt().formatCents(group.groupSpent)}</strong>
                    </span>
                    <span class={`col-leftover ${privacy().blurClass()}`} data-label="Leftover">
                      <strong>{fmt().formatCents(group.groupLeftover)}</strong>
                    </span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </PageState>

      <Show when={selectedCategory()}>
        {(category) => (
          <div
            class="drawer-overlay"
            onClick={() => setSearchParams({ category: undefined }, { replace: true })}
          >
            <aside
              class="context-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="category-editor-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div class="drawer-header">
                <div>
                  <p class="eyebrow">Budget category</p>
                  <h2 id="category-editor-title">Edit category</h2>
                </div>
                <button
                  type="button"
                  class="btn btn-icon btn-ghost"
                  aria-label="Close category editor"
                  onClick={() => setSearchParams({ category: undefined }, { replace: true })}
                >
                  ×
                </button>
              </div>
              <form onSubmit={saveCategory} class="drawer-form">
                <div class="form-group">
                  <label for="category-name">Name</label>
                  <input
                    id="category-name"
                    ref={(element) => {
                      categoryNameInput = element;
                    }}
                    value={editName()}
                    onInput={(event) => setEditName(event.currentTarget.value)}
                    autofocus
                    required
                  />
                </div>
                <div class="form-group">
                  <label for="category-group">Group</label>
                  <select
                    id="category-group"
                    value={editGroupId()}
                    onChange={(event) => setEditGroupId(event.currentTarget.value)}
                  >
                    <option value="">Uncategorized</option>
                    <For each={categoryGroups().filter((group) => !group.hidden)}>
                      {(group) => <option value={group.id}>{group.name}</option>}
                    </For>
                  </select>
                </div>
                <div class="drawer-divider" />
                <div class="form-group">
                  <label for="goal-type">Goal</label>
                  <select
                    id="goal-type"
                    value={goalType()}
                    onChange={(event) => setGoalType(event.currentTarget.value as GoalType)}
                  >
                    <option value="none">No goal</option>
                    <option value="monthly">Monthly amount</option>
                    <option value="byDate">Save up by date</option>
                    <option value="refill">Refill target</option>
                    <option value="periodic">Periodic allocation</option>
                    <option value="percentage">Percentage of income</option>
                  </select>
                </div>
                <Show when={goalType() !== "none" && goalType() !== "percentage"}>
                  <div class="form-group">
                    <label for="goal-amount">Target amount</label>
                    <input
                      id="goal-amount"
                      type="number"
                      min="0"
                      step={fmt().code === "IDR" ? "1" : "0.01"}
                      value={goalAmount()}
                      onInput={(event) => setGoalAmount(event.currentTarget.value)}
                    />
                  </div>
                </Show>
                <Show when={goalType() === "percentage"}>
                  <div class="form-group">
                    <label for="goal-percentage">Percent of income</label>
                    <input
                      id="goal-percentage"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={goalPercentage()}
                      onInput={(event) => setGoalPercentage(event.currentTarget.value)}
                    />
                  </div>
                </Show>
                <Show when={goalType() === "byDate" || goalType() === "refill"}>
                  <div class="form-group">
                    <label for="goal-date">Target month</label>
                    <input
                      id="goal-date"
                      type="month"
                      value={goalTargetDate()}
                      onInput={(event) => setGoalTargetDate(event.currentTarget.value)}
                    />
                  </div>
                </Show>
                <Show when={goalType() === "periodic"}>
                  <div class="form-group">
                    <label for="goal-frequency">Frequency</label>
                    <select
                      id="goal-frequency"
                      value={goalFrequency()}
                      onChange={(event) => setGoalFrequency(event.currentTarget.value)}
                    >
                      <option value="quarterly">Every 3 months</option>
                      <option value="biannual">Every 6 months</option>
                      <option value="yearly">Every 12 months</option>
                    </select>
                  </div>
                </Show>
                <div class="drawer-actions">
                  <button
                    type="button"
                    class="btn btn-ghost"
                    onClick={() => setSearchParams({ category: undefined }, { replace: true })}
                  >
                    Cancel
                  </button>
                  <button type="submit" class="btn btn-primary" disabled={savingCategory()}>
                    {savingCategory() ? "Saving…" : `Save ${category().name}`}
                  </button>
                </div>
              </form>
            </aside>
          </div>
        )}
      </Show>

      <Show when={showNewCategory()}>
        <div class="modal-overlay" onClick={() => setShowNewCategory(false)}>
          <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-category-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div class="modal-header">
              <h2 id="new-category-title">New category</h2>
              <button
                type="button"
                class="modal-close"
                onClick={() => setShowNewCategory(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={createCategory}>
              <div class="form-group">
                <label for="new-category-name">Name</label>
                <input
                  id="new-category-name"
                  value={newCategoryName()}
                  onInput={(event) => setNewCategoryName(event.currentTarget.value)}
                  required
                  autofocus
                />
              </div>
              <div class="form-group">
                <label for="new-category-group">Group</label>
                <select
                  id="new-category-group"
                  value={newCategoryGroup()}
                  onChange={(event) => setNewCategoryGroup(event.currentTarget.value)}
                >
                  <option value="">Uncategorized</option>
                  <For each={categoryGroups().filter((group) => !group.hidden)}>
                    {(group) => <option value={group.id}>{group.name}</option>}
                  </For>
                </select>
              </div>
              <div class="form-actions">
                <button
                  type="button"
                  class="btn btn-ghost"
                  onClick={() => setShowNewCategory(false)}
                >
                  Cancel
                </button>
                <button type="submit" class="btn btn-primary">
                  Create category
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </div>
  );
}
