/**
 * Categories page — manage category groups and categories.
 */
import { createSignal, For, Show, createEffect } from "solid-js";
import { dispatch } from "../lib/pending-ops";

interface CategoryGroup {
  id: string;
  name: string;
  isIncome: boolean;
  sortOrder: number;
}

interface Category {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  isIncome: boolean;
  sortOrder: number;
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
        }));
        setCategories(cats);
      }

      if (groupsRes.ok) {
        const data = (await groupsRes.json()) as any;
        setGroups(data.groups ?? []);
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
    const isIncome = newGroupIsIncome();
    setNewGroupName("");
    setNewGroupIsIncome(false);
    setShowAddGroup(false);
    void dispatch("create_category_group", { name, isIncome }).promise.then(loadData);
  }

  function handleAddCategory(e: Event, groupId: string) {
    e.preventDefault();
    const name = newCatName().trim();
    if (!name) return;
    setNewCatName("");
    setActiveGroupId(null);
    void dispatch("create_category", { name, groupId }).promise.then(loadData);
  }

  function handleDeleteCategory(catId: string) {
    if (!confirm("Delete this category?")) return;
    dispatch("delete_category", { id: catId });
    setCategories((prev) => prev.filter((c) => c.id !== catId));
  }

  function formatCents(cents: number): string {
    const abs = Math.abs(cents);
    return `${cents < 0 ? "-" : ""}$${(abs / 100).toFixed(2)}`;
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
          <For each={grouped()}>
            {([groupId, cats]) => {
              const group = groups().find((g) => g.id === groupId);
              return (
                <div class="section">
                  <div
                    class="budget-group-title"
                    style={{
                      display: "flex",
                      "justify-content": "space-between",
                      "align-items": "center",
                    }}
                  >
                    <span>{group?.name ?? "Uncategorized"}</span>
                    <button
                      class="btn btn-ghost btn-xs"
                      onClick={() =>
                        setActiveGroupId(activeGroupId() === groupId ? null : (groupId as string))
                      }
                    >
                      {activeGroupId() === groupId ? "Cancel" : "+ Category"}
                    </button>
                  </div>

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
                        <div class="payee-row">
                          <span class="payee-name">{cat.name}</span>
                          <button
                            class="btn btn-icon btn-ghost btn-xs"
                            onClick={() => handleDeleteCategory(cat.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              );
            }}
          </For>
        </Show>
      </Show>
    </div>
  );
}
