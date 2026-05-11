/**
 * Rules page — auto-categorization rules for transaction import.
 */
import { createSignal, For, Show, createEffect } from "solid-js";
import { dispatch } from "../lib/pending-ops";

export default function RulesPage() {
  const [rules, setRules] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [showForm, setShowForm] = createSignal(false);

  createEffect(() => {
    void loadRules();
  });

  async function loadRules() {
    try {
      const res = await fetch("/api/rules");
      if (res.ok) {
        const data = (await res.json()) as any;
        setRules(data.rules ?? []);
      }
    } catch {
      // Will work once sync is connected
    } finally {
      setLoading(false);
    }
  }

  function handleDelete(id: string) {
    dispatch("delete_rule", { id });
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  function handleToggleActive(rule: any) {
    const newActive = !rule.active;
    dispatch("update_rule", { id: rule.id, fields: { active: newActive } });
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active: newActive } : r)));
  }

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Rules</h1>
        <button class="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
          + Add Rule
        </button>
      </div>

      <Show when={showForm()}>
        <RuleForm onClose={() => setShowForm(false)} />
      </Show>

      <Show when={!loading()} fallback={<div class="loading">Loading rules...</div>}>
        <Show
          when={rules().length > 0}
          fallback={
            <div class="empty-state">
              <p>No rules yet. Rules auto-categorize transactions when you import CSV files.</p>
              <p>Example: If payee contains "NETFLIX" → set category to "Subscriptions"</p>
            </div>
          }
        >
          <div class="rule-list">
            <For each={rules()}>
              {(rule) => (
                <div class="rule-card" classList={{ "rule-card--inactive": rule.active === false }}>
                  <div class="rule-info">
                    <div class="rule-conditions">
                      Conditions: {rule.conditions?.slice(0, 80)}...
                    </div>
                    <div class="rule-actions-summary">Actions: {rule.actions?.slice(0, 80)}...</div>
                  </div>
                  <div class="rule-actions">
                    <button
                      class="btn btn-sm rule-toggle"
                      classList={{ active: rule.active !== false }}
                      onClick={() => handleToggleActive(rule)}
                      title={rule.active === false ? "Enable rule" : "Disable rule"}
                    >
                      {rule.active === false ? "OFF" : "ON"}
                    </button>
                    <button
                      class="btn btn-icon btn-ghost btn-xs"
                      onClick={() => handleDelete(rule.id)}
                    >
                      🗑️
                    </button>
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

const CONDITION_FIELD_META: Record<string, { type: string; ops: string[]; label: string }> = {
  payee: {
    type: "text",
    label: "Payee",
    ops: ["is", "isNot", "oneOf", "contains", "doesNotContain", "matches"],
  },
  imported_description: {
    type: "text",
    label: "Description",
    ops: ["is", "isNot", "oneOf", "contains", "doesNotContain", "matches"],
  },
  notes: {
    type: "text",
    label: "Notes",
    ops: ["is", "isNot", "oneOf", "contains", "doesNotContain", "matches"],
  },
  account: { type: "text", label: "Account", ops: ["is", "isNot", "oneOf"] },
  amount: {
    type: "number",
    label: "Amount",
    ops: ["is", "isapprox", "isbetween", "gt", "gte", "lt", "lte"],
  },
  date: { type: "date", label: "Date", ops: ["is", "isapprox", "gt", "gte", "lt", "lte"] },
  cleared: { type: "boolean", label: "Cleared", ops: ["is"] },
};

const OP_LABELS: Record<string, string> = {
  is: "is",
  isNot: "is not",
  oneOf: "is one of",
  contains: "contains",
  doesNotContain: "does not contain",
  matches: "matches (regex)",
  isapprox: "is approx",
  isbetween: "is between",
  gt: "greater than",
  gte: "greater than or equal",
  lt: "less than",
  lte: "less than or equal",
};

function RuleForm(props: { onClose: () => void }) {
  const [conditionField, setConditionField] = createSignal("payee");
  const [conditionOp, setConditionOp] = createSignal("contains");
  const [conditionValue, setConditionValue] = createSignal("");
  const [conditionValue2, setConditionValue2] = createSignal("");
  const [actionField, setActionField] = createSignal("category");
  const [actionValue, setActionValue] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const fieldMeta = () => CONDITION_FIELD_META[conditionField()] ?? CONDITION_FIELD_META.payee;

  const availableOps = () => fieldMeta().ops;

  // Reset op when field changes if current op not available
  createEffect(() => {
    const ops = availableOps();
    if (!ops.includes(conditionOp())) {
      setConditionOp(ops[0]);
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!actionValue().trim()) return;

    setSaving(true);

    const cond: any = { field: conditionField(), op: conditionOp() };

    if (fieldMeta().type === "boolean") {
      cond.value = conditionValue() === "true";
    } else if (conditionOp() === "isbetween") {
      cond.value = parseFloat(conditionValue()) || 0;
      cond.value2 = parseFloat(conditionValue2()) || 0;
    } else if (fieldMeta().type === "number") {
      cond.value = parseFloat(conditionValue()) || 0;
    } else if (fieldMeta().type === "date") {
      cond.value = conditionValue();
    } else {
      cond.value = conditionValue().trim();
    }

    const conditions = JSON.stringify([cond]);
    const actions = JSON.stringify([
      { op: "set", field: actionField(), value: actionValue().trim() },
    ]);

    dispatch("create_rule", {
      rule: { conditions, actions },
    });

    setSaving(false);
    props.onClose();
  }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>New Rule</h2>
          <button class="modal-close" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <h3>Condition</h3>
          <div class="form-row">
            <select
              value={conditionField()}
              onChange={(e) => setConditionField(e.currentTarget.value)}
            >
              <For each={Object.entries(CONDITION_FIELD_META)}>
                {([value, meta]) => <option value={value}>{meta.label}</option>}
              </For>
            </select>
            <select value={conditionOp()} onChange={(e) => setConditionOp(e.currentTarget.value)}>
              <For each={availableOps()}>
                {(op) => <option value={op}>{OP_LABELS[op] ?? op}</option>}
              </For>
            </select>

            <Show when={fieldMeta().type === "boolean"}>
              <select
                value={conditionValue()}
                onChange={(e) => setConditionValue(e.currentTarget.value)}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </Show>

            <Show when={fieldMeta().type === "number" && conditionOp() !== "isbetween"}>
              <input
                type="number"
                step="any"
                placeholder="0"
                value={conditionValue()}
                onInput={(e) => setConditionValue(e.currentTarget.value)}
                required
              />
            </Show>

            <Show when={fieldMeta().type === "number" && conditionOp() === "isbetween"}>
              <input
                type="number"
                step="any"
                placeholder="Min"
                value={conditionValue()}
                onInput={(e) => setConditionValue(e.currentTarget.value)}
                required
              />
              <span style={{ padding: "0 4px", color: "var(--text-secondary)" }}>and</span>
              <input
                type="number"
                step="any"
                placeholder="Max"
                value={conditionValue2()}
                onInput={(e) => setConditionValue2(e.currentTarget.value)}
                required
              />
            </Show>

            <Show when={fieldMeta().type === "date"}>
              <input
                type="date"
                value={conditionValue()}
                onInput={(e) => setConditionValue(e.currentTarget.value)}
                required
              />
            </Show>

            <Show when={fieldMeta().type === "text"}>
              <input
                type="text"
                placeholder="Value..."
                value={conditionValue()}
                onInput={(e) => setConditionValue(e.currentTarget.value)}
                required
              />
            </Show>
          </div>

          <h3>Action</h3>
          <div class="form-row">
            <select value={actionField()} onChange={(e) => setActionField(e.currentTarget.value)}>
              <option value="category">Set category</option>
              <option value="payee">Set payee</option>
              <option value="notes">Set notes</option>
            </select>
            <input
              type="text"
              placeholder="Value..."
              value={actionValue()}
              onInput={(e) => setActionValue(e.currentTarget.value)}
              required
            />
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-ghost" onClick={props.onClose}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" disabled={saving()}>
              {saving() ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
