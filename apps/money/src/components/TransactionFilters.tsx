import { createSignal, createEffect, For, Show, onCleanup } from "solid-js";
import { dispatch } from "../lib/pending-ops";
import { api } from "../lib/api";
import type { JSX } from "solid-js";
import type {
  AccountsResponse,
  CategoriesResponse,
  FiltersResponse,
} from "../domain/schemas-client";

type CondOp =
  | "is"
  | "isNot"
  | "contains"
  | "doesNotContain"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "isbetween"
  | "oneOf";

export interface Condition {
  field: string;
  op: CondOp;
  value: unknown;
  value2?: unknown;
}

type SavedFilter = Pick<FiltersResponse["filters"][number], "id" | "name" | "conditions"> & {
  conditionsOp: "and" | "or";
};

type Account = Pick<AccountsResponse["accounts"][number], "id" | "name">;

type Category = Pick<CategoriesResponse["categories"][number], "id" | "name"> & {
  groupName?: string | null;
};

type FieldConfig = {
  label: string;
  ops: CondOp[];
  render: (
    value: unknown,
    onChange: (v: unknown) => void,
    value2?: unknown,
    onChange2?: (v: unknown) => void,
  ) => JSX.Element;
};

const FIELD_CONFIGS: Record<string, FieldConfig> = {
  account: {
    label: "Account",
    ops: ["is", "isNot"],
    render: (value, onChange) => {
      const [accounts, setAccounts] = createSignal<Account[]>([]);
      createEffect(() => {
        void api
          .accounts()
          .then((data) => setAccounts(data.accounts.map(({ id, name }) => ({ id, name }))))
          .catch(() => {
            console.warn("[TransactionFilters] failed to load accounts");
          });
      });
      return (
        <select value={String(value as string)} onChange={(e) => onChange(e.currentTarget.value)}>
          <option value="">Select account</option>
          <For each={accounts()}>{(a) => <option value={a.id}>{a.name}</option>}</For>
        </select>
      );
    },
  },
  payee: {
    label: "Payee",
    ops: ["contains", "doesNotContain", "is", "isNot"],
    render: (value, onChange) => (
      <input
        type="text"
        class="filter-input"
        placeholder="Search payees..."
        value={typeof value === "string" ? value : ""}
        onInput={(event) => onChange(event.currentTarget.value)}
      />
    ),
  },
  category: {
    label: "Category",
    ops: ["is", "isNot"],
    render: (value, onChange) => {
      const [cats, setCats] = createSignal<Category[]>([]);
      createEffect(() => {
        void api
          .categories()
          .then((data) =>
            setCats(
              data.categories.map((category) => ({
                id: category.id,
                name: category.name,
                groupName: category.group_name ?? null,
              })),
            ),
          )
          .catch(() => {
            console.warn("[TransactionFilters] failed to load categories");
          });
      });
      return (
        <select value={String(value as string)} onChange={(e) => onChange(e.currentTarget.value)}>
          <option value="">Select category</option>
          <For each={cats()}>
            {(c) => (
              <option value={c.id}>
                {c.groupName ? `${c.groupName}: ` : ""}
                {c.name}
              </option>
            )}
          </For>
        </select>
      );
    },
  },
  amount: {
    label: "Amount",
    ops: ["is", "isNot", "gt", "gte", "lt", "lte", "isbetween"],
    render: (value, onChange, value2, onChange2) => (
      <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
        <input
          type="number"
          class="filter-input filter-input-num"
          placeholder="0"
          value={String(value as string)}
          onInput={(e) => onChange(Number(e.currentTarget.value) * 100)}
        />
        <Show when={typeof value2 !== "undefined"}>
          <span style={{ color: "var(--text-muted)" }}>to</span>
          <input
            type="number"
            class="filter-input filter-input-num"
            placeholder="0"
            value={String(value2 as string)}
            onInput={(e) => onChange2?.(Number(e.currentTarget.value) * 100)}
          />
        </Show>
      </div>
    ),
  },
  date: {
    label: "Date",
    ops: ["is", "isNot", "gt", "gte", "lt", "lte", "isbetween"],
    render: (value, onChange, value2, onChange2) => (
      <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
        <input
          type="date"
          class="filter-input"
          value={String(value as string)}
          onInput={(e) => onChange(e.currentTarget.value)}
        />
        <Show when={typeof value2 !== "undefined"}>
          <span style={{ color: "var(--text-muted)" }}>to</span>
          <input
            type="date"
            class="filter-input"
            value={String(value2 as string)}
            onInput={(e) => onChange2?.(e.currentTarget.value)}
          />
        </Show>
      </div>
    ),
  },
  notes: {
    label: "Notes",
    ops: ["contains", "doesNotContain"],
    render: (value, onChange) => (
      <input
        type="text"
        class="filter-input"
        placeholder="Search notes..."
        value={String(value as string)}
        onInput={(e) => onChange(e.currentTarget.value)}
      />
    ),
  },
  cleared: {
    label: "Cleared",
    ops: ["is"],
    render: (value, onChange) => (
      <label style={{ display: "flex", "align-items": "center", gap: "6px", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        Cleared
      </label>
    ),
  },
  reconciled: {
    label: "Reconciled",
    ops: ["is"],
    render: (value, onChange) => (
      <label style={{ display: "flex", "align-items": "center", gap: "6px", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        Reconciled
      </label>
    ),
  },
};

const OP_LABELS: Record<CondOp, string> = {
  is: "is",
  isNot: "is not",
  contains: "contains",
  doesNotContain: "does not contain",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  isbetween: "between",
  oneOf: "is any of",
};

function fieldLabel(f: string): string {
  return FIELD_CONFIGS[f]?.label ?? f;
}

function conditionLabel(cond: Condition): string {
  const f = fieldLabel(cond.field);
  const op = OP_LABELS[cond.op] ?? cond.op;
  const v = String((cond.value as string) ?? "");
  if (cond.op === "isbetween") {
    return `${f} ${op} ${v} and ${String((cond.value2 as string) ?? "")}`;
  }
  return `${f} ${op} ${v}`;
}

export default function TransactionFilters(props: {
  accountId?: string;
  activeConditions: Condition[];
  activeConditionsOp?: "and" | "or";
  onConditionsChange: (
    conditions: Condition[],
    conditionsOp: "and" | "or",
    filterId: string | null,
  ) => void;
}) {
  const conditionsOp = () => props.activeConditionsOp ?? "and";

  const [savedFilters, setSavedFilters] = createSignal<SavedFilter[]>([]);
  const [showAddMenu, setShowAddMenu] = createSignal(false);
  const [showSavedMenu, setShowSavedMenu] = createSignal(false);

  const [editField, setEditField] = createSignal("");
  const [editOp, setEditOp] = createSignal<CondOp>("is");
  const [editValue, setEditValue] = createSignal<unknown>("");
  const [editValue2, setEditValue2] = createSignal<unknown>(undefined);
  const [showBuilder, setShowBuilder] = createSignal(false);

  const [saveName, setSaveName] = createSignal("");
  const [showSave, setShowSave] = createSignal(false);

  createEffect(() => {
    void api
      .filters()
      .then((data) =>
        setSavedFilters(
          data.filters.map((filter) => ({
            id: filter.id,
            name: filter.name,
            conditions: filter.conditions,
            conditionsOp: filter.conditionsOp === "or" ? "or" : "and",
          })),
        ),
      )
      .catch(() => {
        console.warn("[TransactionFilters] failed to load saved filters");
      });
  });

  function addCondition() {
    if (!editField()) return;
    const newCond: Condition = {
      field: editField(),
      op: editOp(),
      value: editValue(),
      value2: editOp() === "isbetween" ? editValue2() : undefined,
    };
    const updated = [...props.activeConditions, newCond];
    props.onConditionsChange(updated, conditionsOp(), null);
    setShowBuilder(false);
    setEditField("");
    setEditOp("is");
    setEditValue("");
    setEditValue2(undefined);
  }

  function removeCondition(idx: number) {
    const updated = props.activeConditions.filter((_, i) => i !== idx);
    props.onConditionsChange(updated, conditionsOp(), null);
  }

  function clearAll() {
    props.onConditionsChange([], "and", null);
  }

  function loadFilter(filter: SavedFilter) {
    let conditions: Condition[];
    try {
      conditions = JSON.parse(filter.conditions);
    } catch {
      console.warn("[TransactionFilters] failed to parse saved filter conditions");
      conditions = [];
    }
    props.onConditionsChange(conditions, filter.conditionsOp, filter.id);
    setShowSavedMenu(false);
  }

  function saveAsNew() {
    const name = saveName().trim();
    if (!name) return;
    dispatch("create_filter", {
      filter: {
        name,
        conditions: JSON.stringify(props.activeConditions),
        conditionsOp: conditionsOp(),
      },
    });
    setSaveName("");
    setShowSave(false);
  }

  function deleteFilter(id: string) {
    dispatch("delete_filter", { id });
    props.onConditionsChange([], "and", null);
  }

  function toggleConditionsOp() {
    const next = conditionsOp() === "and" ? "or" : "and";
    props.onConditionsChange(props.activeConditions, next, null);
  }

  createEffect(() => {
    if (showAddMenu() || showSavedMenu() || showBuilder()) {
      const handler = () => {
        setShowAddMenu(false);
        setShowSavedMenu(false);
      };
      document.addEventListener("click", handler);
      onCleanup(() => document.removeEventListener("click", handler));
    }
  });

  const matchedFilter = () =>
    savedFilters().find((f) => JSON.stringify(props.activeConditions) === f.conditions) ?? null;

  return (
    <div class="filter-bar">
      <div class="filter-bar-header">
        <div class="filter-bar-row">
          <Show when={props.activeConditions.length > 1}>
            <button class="btn btn-xs btn-ghost filter-op-toggle" onClick={toggleConditionsOp}>
              {conditionsOp() === "and" ? "all" : "any"}
            </button>
          </Show>

          <div class="filter-chips">
            <For each={props.activeConditions}>
              {(cond, idx) => (
                <span class="filter-chip">
                  <span class="filter-chip-label">{conditionLabel(cond)}</span>
                  <button class="filter-chip-remove" onClick={() => removeCondition(idx())}>
                    ✕
                  </button>
                </span>
              )}
            </For>
          </div>

          <div style={{ position: "relative" }}>
            <button
              class="btn btn-xs btn-ghost"
              onClick={(e) => {
                e.stopPropagation();
                setShowAddMenu(!showAddMenu());
              }}
            >
              + Filter
            </button>
            <Show when={showAddMenu()}>
              <div class="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                <For each={Object.entries(FIELD_CONFIGS)}>
                  {([key, cfg]) => (
                    <button
                      class="filter-dropdown-item"
                      onClick={() => {
                        setShowAddMenu(false);
                        setEditField(key);
                        setEditOp(cfg.ops[0]);
                        setEditValue("");
                        setEditValue2(undefined);
                        setShowBuilder(true);
                      }}
                    >
                      {cfg.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <Show when={props.activeConditions.length > 0}>
            <button class="btn btn-xs btn-ghost" onClick={clearAll}>
              Clear
            </button>
          </Show>
        </div>

        <div style={{ display: "flex", gap: "6px", "align-items": "center" }}>
          <Show when={props.activeConditions.length > 0}>
            <div style={{ position: "relative" }}>
              <button
                class="btn btn-xs btn-ghost filter-save-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSavedMenu(!showSavedMenu());
                }}
              >
                {matchedFilter()?.name ?? "Unsaved filter"} ▾
              </button>
              <Show when={showSavedMenu()}>
                <div
                  class="filter-dropdown filter-dropdown-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Show when={savedFilters().length > 0}>
                    <div class="filter-dropdown-label">Load saved filter</div>
                    <For each={savedFilters()}>
                      {(f) => (
                        <div class="filter-dropdown-item-row">
                          <button class="filter-dropdown-item" onClick={() => loadFilter(f)}>
                            {f.name}
                          </button>
                          <button
                            class="btn btn-icon btn-xs btn-ghost"
                            style={{ color: "var(--text-muted)" }}
                            onClick={() => deleteFilter(f.id)}
                            title={`Delete "${f.name}"`}
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </For>
                    <div class="filter-dropdown-divider" />
                  </Show>
                  <button
                    class="filter-dropdown-item"
                    onClick={() => {
                      setShowSavedMenu(false);
                      setShowSave(true);
                    }}
                  >
                    Save as new filter...
                  </button>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      <Show when={showBuilder()}>
        <div class="filter-builder">
          <div class="filter-builder-row">
            <span class="filter-builder-label">Where</span>
            <select
              class="filter-input filter-input-select"
              value={editField()}
              onChange={(e) => {
                const field = e.currentTarget.value;
                setEditField(field);
                const ops = FIELD_CONFIGS[field]?.ops ?? ["is"];
                setEditOp(ops[0]);
                setEditValue("");
                setEditValue2(undefined);
              }}
            >
              <For each={Object.entries(FIELD_CONFIGS)}>
                {([key, cfg]) => <option value={key}>{cfg.label}</option>}
              </For>
            </select>

            <select
              class="filter-input filter-input-select"
              value={editOp()}
              onChange={(e) => {
                setEditOp(e.currentTarget.value as CondOp);
                if (e.currentTarget.value !== "isbetween") setEditValue2(undefined);
              }}
            >
              <For each={FIELD_CONFIGS[editField()]?.ops ?? ["is"]}>
                {(op) => <option value={op}>{OP_LABELS[op]}</option>}
              </For>
            </select>

            {FIELD_CONFIGS[editField()]?.render(
              editValue(),
              setEditValue,
              editValue2(),
              setEditValue2,
            )}

            <div class="filter-builder-actions">
              <button class="btn btn-primary btn-xs" onClick={addCondition}>
                Add
              </button>
              <button class="btn btn-ghost btn-xs" onClick={() => setShowBuilder(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={showSave()}>
        <div class="filter-builder">
          <div class="filter-builder-row">
            <span class="filter-builder-label">Name</span>
            <input
              type="text"
              class="filter-input"
              placeholder="My saved filter"
              value={saveName()}
              onInput={(e) => setSaveName(e.currentTarget.value)}
              autofocus
            />
            <button class="btn btn-primary btn-xs" onClick={saveAsNew}>
              Save
            </button>
            <button class="btn btn-ghost btn-xs" onClick={() => setShowSave(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

export type { SavedFilter, CondOp };
