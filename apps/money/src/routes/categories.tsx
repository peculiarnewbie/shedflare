import { createSignal, For, Show, createEffect } from "solid-js";
import { dispatch } from "../lib/pending-ops";

interface CategoryGroup {
  id: string;
  name: string;
  isIncome: boolean;
  sortOrder: number;
  hidden: boolean;
}

interface Category {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  isIncome: boolean;
  sortOrder: number;
  goalDef: string | null;
  hidden: boolean;
}

interface GoalConfig {
  type: "monthly" | "byDate";
  amount: number;
  targetDate?: string;
}

export default function CategoriesPage() {
  const [groups, setGroups] = createSignal<CategoryGroup[]>([]);
  const [categories, setCategories] = createSignal<Category[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Add group form
  const [showAddGroup, setShowAddGroup] = createSignal(false);
  const [newGroupName, setNewGroupName] = createSignal("");
  const [newGroupIsIncome, setNewGroupIsIncome] = createSignal(false);

  // Add category form
  const [activeGroupId, setActiveGroupId] = createSignal<string | null>(null);
  const [newCatName, setNewCatName] = createSignal("");

  // Goal editing
  const [editingGoalCatId, setEditingGoalCatId] = createSignal<string | null>(null);
  const [goalType, setGoalType] = createSignal<"monthly" | "byDate">("monthly");
  const [goalAmount, setGoalAmount] = createSignal("");
  const [goalTargetDate, setGoalTargetDate] = createSignal("");

  // Group rename
  const [renamingGroupId, setRenamingGroupId] = createSignal<string | null>(null);
  const [renameGroupName, setRenameGroupName] = createSignal("");

  // Group delete dialog
  const [deletingGroupId, setDeletingGroupId] = createSignal<string | null>(null);
  const [deleteTransferGroupId, setDeleteTransferGroupId] = createSignal<string>("");

  // Category delete with transfer
  const [deletingCatId, setDeletingCatId] = createSignal<string | null>(null);
  const [catTransferTargetId, setCatTransferTargetId] = createSignal<string>("");

  createEffect(() => {
    void loadData();
  });

  async function loadData() {
    try {
      const [categoriesRes, groupsRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/category-groups"),
      ]);
      if (categoriesRes.ok) {
        const data = (await categoriesRes.json()) as any;
        const cats: Category[] = (data.categories ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          groupId: c.group_id ?? null,
          groupName: c.group_name ?? null,
          isIncome: Boolean(c.is_income),
          sortOrder: c.sort_order ?? 0,
          goalDef: c.goal_def ?? null,
          hidden: Boolean(c.hidden),
        }));
        setCategories(cats);
      }

      if (groupsRes.ok) {
        const data = (await groupsRes.json()) as any;
        setGroups(
          (data.groups ?? []).map((g: any) => ({
            id: g.id,
            name: g.name,
            isIncome: Boolean(g.isIncome),
            sortOrder: g.sortOrder ?? 0,
            hidden: Boolean(g.hidden),
          })),
        );
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function handleAddGroup(e: Event) {
    e.preventDefault();
    const name = newGroupName().trim();
    if (!name) return;
    setNewGroupName("");
    setNewGroupIsIncome(false);
    setShowAddGroup(false);
    void dispatch("create_category_group", { name, isIncome: newGroupIsIncome() }).promise.then(
      loadData,
    );
  }

  function handleAddCategory(e: Event, groupId: string) {
    e.preventDefault();
    const name = newCatName().trim();
    if (!name) return;
    setNewCatName("");
    setActiveGroupId(null);
    void dispatch("create_category", { name, groupId }).promise.then(loadData);
  }

  function startRenameGroup(group: CategoryGroup) {
    setRenamingGroupId(group.id);
    setRenameGroupName(group.name);
  }

  function handleRenameGroup(groupId: string) {
    const name = renameGroupName().trim();
    if (!name) {
      cancelRenameGroup();
      return;
    }
    setRenamingGroupId(null);
    void dispatch("update_category_group", { id: groupId, name }).promise.then(loadData);
  }

  function cancelRenameGroup() {
    setRenamingGroupId(null);
    setRenameGroupName("");
  }

  function handleToggleGroupHidden(group: CategoryGroup) {
    void dispatch("update_category_group", { id: group.id, hidden: !group.hidden }).promise.then(
      loadData,
    );
    setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, hidden: !g.hidden } : g)));
  }

  function handleToggleGroupIsIncome(group: CategoryGroup) {
    void dispatch("update_category_group", {
      id: group.id,
      isIncome: !group.isIncome,
    }).promise.then(loadData);
    setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, isIncome: !g.isIncome } : g)));
  }

  function confirmDeleteGroup(groupId: string) {
    setDeletingGroupId(groupId);
    setDeleteTransferGroupId("");
  }

  function handleDeleteGroup() {
    const groupId = deletingGroupId();
    if (!groupId) return;
    const payload: Record<string, string | null> = { id: groupId };
    if (deleteTransferGroupId()) {
      payload.transferToGroupId = deleteTransferGroupId();
    }
    setDeletingGroupId(null);
    void dispatch("delete_category_group", payload).promise.then(loadData);
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function handleToggleCategoryHidden(cat: Category) {
    void dispatch("update_category", { id: cat.id, hidden: !cat.hidden }).promise.then(loadData);
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, hidden: !c.hidden } : c)));
  }

  function confirmDeleteCategory(catId: string) {
    setDeletingCatId(catId);
    setCatTransferTargetId("");
  }

  function handleDeleteCategory() {
    const catId = deletingCatId();
    if (!catId) return;
    const payload: Record<string, string | null | undefined> = { id: catId };
    if (catTransferTargetId()) {
      payload.transferToId = catTransferTargetId();
    }
    setDeletingCatId(null);
    dispatch("delete_category", payload);
    setCategories((prev) => prev.filter((c) => c.id !== catId));
  }

  function startEditGoal(cat: Category) {
    const goal = parseGoal(cat.goalDef);
    setGoalType(goal?.type ?? "monthly");
    setGoalAmount(goal ? String(goal.amount / 100) : "");
    setGoalTargetDate(goal?.targetDate ?? "");
    setEditingGoalCatId(cat.id);
  }

  function cancelEditGoal() {
    setEditingGoalCatId(null);
    setGoalAmount("");
    setGoalTargetDate("");
  }

  function saveGoal(catId: string) {
    const amount = Math.round(parseFloat(goalAmount() || "0") * 100);
    if (amount <= 0) {
      dispatch("update_category", { id: catId, goalDef: null });
    } else {
      const goal: GoalConfig = { type: goalType(), amount };
      if (goalType() === "byDate" && goalTargetDate()) {
        goal.targetDate = goalTargetDate();
      }
      dispatch("update_category", { id: catId, goalDef: JSON.stringify(goal) });
    }
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? {
              ...c,
              goalDef:
                amount > 0
                  ? JSON.stringify(
                      goalType() === "byDate"
                        ? { type: goalType(), amount, targetDate: goalTargetDate() || undefined }
                        : { type: goalType(), amount },
                    )
                  : null,
            }
          : c,
      ),
    );
    cancelEditGoal();
  }

  function parseGoal(goalDef: string | null): GoalConfig | null {
    if (!goalDef) return null;
    try {
      return JSON.parse(goalDef) as GoalConfig;
    } catch {
      return null;
    }
  }

  function formatGoal(goalDef: string | null): string {
    const goal = parseGoal(goalDef);
    if (!goal) return "";
    const amt = `$${(goal.amount / 100).toFixed(2)}`;
    if (goal.type === "byDate" && goal.targetDate) {
      return `Save ${amt} by ${goal.targetDate}`;
    }
    return `Set ${amt} monthly`;
  }

  const grouped = () => {
    const map = new Map<string | null, Category[]>();
    for (const cat of categories()) {
      const list = map.get(cat.groupId) ?? [];
      list.push(cat);
      map.set(cat.groupId, list);
    }
    for (const group of groups()) {
      if (!map.has(group.id)) map.set(group.id, []);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const groupA = groups().find((g) => g.id === a);
      const groupB = groups().find((g) => g.id === b);
      return (groupA?.sortOrder ?? 0) - (groupB?.sortOrder ?? 0);
    });
  };

  const visibleGroups = () =>
    grouped().filter(([groupId]) => {
      const group = groups().find((g) => g.id === groupId);
      return !group?.hidden;
    });

  const hiddenGroups = () =>
    grouped().filter(([groupId]) => {
      const group = groups().find((g) => g.id === groupId);
      return group?.hidden;
    });

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Categories</h1>
        <button class="btn btn-primary btn-sm" onClick={() => setShowAddGroup(true)}>
          + Add Group
        </button>
      </div>

      <Show when={showAddGroup()}>
        <div class="section">
          <form onSubmit={handleAddGroup} class="settings-section">
            <div class="form-row">
              <div class="form-group" style={{ flex: "1" }}>
                <label>Group Name</label>
                <input
                  type="text"
                  placeholder="e.g. Fixed Expenses"
                  value={newGroupName()}
                  onInput={(e) => setNewGroupName(e.currentTarget.value)}
                  required
                  autofocus
                />
              </div>
              <div class="form-check" style={{ "margin-top": "24px" }}>
                <input
                  type="checkbox"
                  id="income-group"
                  checked={newGroupIsIncome()}
                  onChange={(e) => setNewGroupIsIncome(e.currentTarget.checked)}
                />
                <label for="income-group">Income group</label>
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-ghost" onClick={() => setShowAddGroup(false)}>
                Cancel
              </button>
              <button type="submit" class="btn btn-primary">
                Create Group
              </button>
            </div>
          </form>
        </div>
      </Show>

      <Show when={!loading()} fallback={<div class="loading">Loading categories...</div>}>
        <Show
          when={groups().length > 0 || categories().length > 0}
          fallback={
            <div class="empty-state">
              <p>No categories yet.</p>
              <p>Create a group above, then add categories to it.</p>
            </div>
          }
        >
          <For each={visibleGroups()}>
            {([groupId, cats]) => {
              const group = groups().find((g) => g.id === groupId);
              return (
                <div class="section">
                  <div
                    class="budget-group-title"
                    style={{ display: "flex", "flex-direction": "column", gap: "4px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        "justify-content": "space-between",
                        "align-items": "center",
                        width: "100%",
                      }}
                    >
                      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                        <Show
                          when={renamingGroupId() === group?.id}
                          fallback={
                            <span
                              style={{ cursor: "pointer" }}
                              onClick={() => group && startRenameGroup(group)}
                              title="Rename group"
                            >
                              {group?.name ?? "Uncategorized"}
                              {group?.isIncome ? (
                                <span class="goal-badge" style={{ "margin-left": "8px" }}>
                                  Income
                                </span>
                              ) : null}
                            </span>
                          }
                        >
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (group) handleRenameGroup(group.id);
                            }}
                            style={{ display: "inline-flex", gap: "4px" }}
                          >
                            <input
                              type="text"
                              value={renameGroupName()}
                              onInput={(e) => setRenameGroupName(e.currentTarget.value)}
                              autofocus
                              onBlur={() => {
                                if (group) handleRenameGroup(group.id);
                              }}
                            />
                          </form>
                        </Show>
                      </div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          class="btn btn-ghost btn-xs"
                          onClick={() => group && handleToggleGroupIsIncome(group)}
                          title={group?.isIncome ? "Switch to expense" : "Switch to income"}
                        >
                          {group?.isIncome ? "💰" : "💳"}
                        </button>
                        <button
                          class="btn btn-ghost btn-xs"
                          onClick={() => group && handleToggleGroupHidden(group)}
                          title={group?.hidden ? "Show group" : "Hide group"}
                        >
                          {group?.hidden ? "👁️" : "👁️‍🗨️"}
                        </button>
                        <button
                          class="btn btn-ghost btn-xs"
                          onClick={() =>
                            setActiveGroupId(
                              activeGroupId() === groupId ? null : (groupId as string),
                            )
                          }
                        >
                          {activeGroupId() === groupId ? "Cancel" : "+ Category"}
                        </button>
                        <Show when={group}>
                          <button
                            class="btn btn-icon btn-ghost btn-xs"
                            onClick={() => group && confirmDeleteGroup(group.id)}
                            title="Delete group"
                          >
                            🗑️
                          </button>
                        </Show>
                      </div>
                    </div>
                  </div>

                  <Show when={deletingGroupId() === group?.id}>
                    <div class="goal-editor">
                      <div class="form-row">
                        <select
                          value={deleteTransferGroupId()}
                          onChange={(e) => setDeleteTransferGroupId(e.currentTarget.value)}
                        >
                          <option value="">Delete categories inside too</option>
                          <For each={groups().filter((g) => g.id !== groupId && !g.hidden)}>
                            {(g) => <option value={g.id}>Move categories to {g.name}</option>}
                          </For>
                        </select>
                        <button class="btn btn-primary btn-sm" onClick={handleDeleteGroup}>
                          Confirm Delete
                        </button>
                        <button
                          class="btn btn-ghost btn-sm"
                          onClick={() => setDeletingGroupId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </Show>

                  <Show when={activeGroupId() === groupId}>
                    <form
                      onSubmit={(e) => handleAddCategory(e, groupId as string)}
                      class="settings-section"
                      style={{ padding: "12px 16px", "margin-bottom": "8px" }}
                    >
                      <div class="form-row">
                        <div class="form-group" style={{ flex: "1", "margin-bottom": 0 }}>
                          <input
                            type="text"
                            placeholder="Category name"
                            value={newCatName()}
                            onInput={(e) => setNewCatName(e.currentTarget.value)}
                            required
                            autofocus
                          />
                        </div>
                        <button type="submit" class="btn btn-primary btn-sm">
                          Add
                        </button>
                      </div>
                    </form>
                  </Show>

                  <div class="category-list">
                    <For each={cats}>
                      {(cat) => (
                        <>
                          <div class="payee-row" style={{ opacity: cat.hidden ? 0.5 : 1 }}>
                            <div
                              style={{ display: "flex", "flex-direction": "column", gap: "2px" }}
                            >
                              <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                                <span class="payee-name">{cat.name}</span>
                                <Show when={cat.hidden}>
                                  <span class="goal-badge" style={{ "font-size": "11px" }}>
                                    Hidden
                                  </span>
                                </Show>
                              </div>
                              <Show when={cat.goalDef}>
                                <span class="goal-badge">{formatGoal(cat.goalDef)}</span>
                              </Show>
                            </div>
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button
                                class="btn btn-ghost btn-xs"
                                onClick={() => handleToggleCategoryHidden(cat)}
                                title={cat.hidden ? "Unhide" : "Hide"}
                              >
                                {cat.hidden ? "👁️" : "👁️‍🗨️"}
                              </button>
                              <button
                                class="btn btn-ghost btn-xs"
                                onClick={() => startEditGoal(cat)}
                                title="Set goal"
                              >
                                🎯
                              </button>
                              <button
                                class="btn btn-icon btn-ghost btn-xs"
                                onClick={() => confirmDeleteCategory(cat.id)}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                          <Show when={deletingCatId() === cat.id}>
                            <div class="goal-editor">
                              <div class="form-row">
                                <select
                                  value={catTransferTargetId()}
                                  onChange={(e) => setCatTransferTargetId(e.currentTarget.value)}
                                >
                                  <option value="">Delete permanently</option>
                                  <For
                                    each={categories().filter((c) => c.id !== cat.id && !c.hidden)}
                                  >
                                    {(c) => <option value={c.id}>Transfer to {c.name}</option>}
                                  </For>
                                </select>
                                <button
                                  class="btn btn-primary btn-sm"
                                  onClick={handleDeleteCategory}
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  class="btn btn-ghost btn-sm"
                                  onClick={() => setDeletingCatId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </Show>
                          <Show when={editingGoalCatId() === cat.id}>
                            <div class="goal-editor">
                              <div class="form-row">
                                <select
                                  value={goalType()}
                                  onChange={(e) =>
                                    setGoalType(e.currentTarget.value as "monthly" | "byDate")
                                  }
                                >
                                  <option value="monthly">Monthly amount</option>
                                  <option value="byDate">Save up by date</option>
                                </select>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="Amount"
                                  value={goalAmount()}
                                  onInput={(e) => setGoalAmount(e.currentTarget.value)}
                                />
                                <Show when={goalType() === "byDate"}>
                                  <input
                                    type="date"
                                    value={goalTargetDate()}
                                    onInput={(e) => setGoalTargetDate(e.currentTarget.value)}
                                  />
                                </Show>
                                <button
                                  class="btn btn-primary btn-sm"
                                  onClick={() => saveGoal(cat.id)}
                                >
                                  Save
                                </button>
                                <button class="btn btn-ghost btn-sm" onClick={cancelEditGoal}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </Show>
                        </>
                      )}
                    </For>
                  </div>
                </div>
              );
            }}
          </For>

          <Show when={hiddenGroups().length > 0}>
            <div class="section">
              <div class="budget-group-title">
                <span style={{ opacity: 0.5 }}>Hidden Groups ({hiddenGroups().length})</span>
              </div>
              <div class="category-list">
                <For each={hiddenGroups()}>
                  {([groupId]) => {
                    const group = groups().find((g) => g.id === groupId);
                    if (!group) return null;
                    return (
                      <div class="payee-row" style={{ opacity: 0.5 }}>
                        <span class="payee-name">{group.name}</span>
                        <button
                          class="btn btn-ghost btn-xs"
                          onClick={() => handleToggleGroupHidden(group)}
                          title="Unhide group"
                        >
                          👁️
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
