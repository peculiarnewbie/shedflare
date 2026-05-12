/**
 * Rules page — auto-categorization rules for transaction import.
 */
import { createSignal, For, Show, createEffect } from "solid-js";
import { dispatch } from "../lib/pending-ops";
import { useCurrency } from "../lib/currency";

export default function RulesPage() {
  const [rules, setRules] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [showForm, setShowForm] = createSignal(false);
  const [testingRule, setTestingRule] = createSignal<any | null>(null);

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

      <Show when={testingRule()}>
        <RuleTestModal rule={testingRule()!} onClose={() => setTestingRule(null)} />
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
                    <div class="rule-actions-summary">{summarizeActions(rule.actions)}</div>
                  </div>
                  <div class="rule-actions">
                    <button
                      class="btn btn-sm btn-ghost"
                      onClick={() => setTestingRule(rule)}
                      title="Test rule against existing transactions"
                    >
                      Test
                    </button>
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

// ─── Condition matching logic (mirrors server-side import.ts) ────────────

function matchCondition(cond: any, tx: any): boolean {
  if (!cond || !cond.field) return false;
  const op = cond.op ?? "is";

  const fieldResolvers: Record<string, () => any> = {
    payee: () => tx.payee,
    imported_description: () => tx.imported_description ?? tx.importedDescription,
    notes: () => tx.notes,
    account: () => tx.account_name ?? tx.accountName ?? tx.account,
    amount: () => tx.amount,
    date: () => (tx.date ? new Date(tx.date) : null),
    cleared: () => tx.cleared ?? true,
  };

  const fieldValue = fieldResolvers[cond.field]?.() ?? "";

  switch (op) {
    case "is": {
      if (cond.field === "cleared") return fieldValue === cond.value;
      const fv = String(fieldValue ?? "").toLowerCase();
      const value = String(cond.value ?? "").toLowerCase();
      return fv === value;
    }
    case "isNot": {
      const fv = String(fieldValue ?? "").toLowerCase();
      const value = String(cond.value ?? "").toLowerCase();
      return fv !== value;
    }
    case "oneOf": {
      const fv = String(fieldValue ?? "").toLowerCase();
      return ((cond.value as string[]) ?? []).map((v: string) => v.toLowerCase()).includes(fv);
    }
    case "contains": {
      const fv = String(fieldValue ?? "").toLowerCase();
      const value = String(cond.value ?? "").toLowerCase();
      return fv.includes(value);
    }
    case "doesNotContain": {
      const fv = String(fieldValue ?? "").toLowerCase();
      const value = String(cond.value ?? "").toLowerCase();
      return !fv.includes(value);
    }
    case "matches":
      return new RegExp(String(cond.value ?? "")).test(String(fieldValue ?? ""));
    case "isapprox": {
      const fv = Number(fieldValue) || 0;
      const value = Number(cond.value) || 0;
      return Math.abs(fv - value) <= Math.max(Math.abs(value) * 0.1, 1);
    }
    case "isbetween": {
      const fv = Number(fieldValue) || 0;
      const min = Number(cond.value) || 0;
      const max = Number(cond.value2) || 0;
      return fv >= min && fv <= max;
    }
    case "gt": {
      return (Number(fieldValue) || 0) > (Number(cond.value) || 0);
    }
    case "gte": {
      return (Number(fieldValue) || 0) >= (Number(cond.value) || 0);
    }
    case "lt": {
      return (Number(fieldValue) || 0) < (Number(cond.value) || 0);
    }
    case "lte": {
      return (Number(fieldValue) || 0) <= (Number(cond.value) || 0);
    }
    default:
      return false;
  }
}

function ruleMatchesTransaction(conditionsJson: string, conditionsOp: string | undefined, tx: any): boolean {
  try {
    const conditions = JSON.parse(conditionsJson) as Array<any>;
    if (conditions.length === 0) return false;
    if (conditionsOp === "or") {
      return conditions.some((cond) => matchCondition(cond, tx));
    }
    return conditions.every((cond) => matchCondition(cond, tx));
  } catch {
    return false;
  }
}

// ─── Rule Test Modal ──────────────────────────────────────────────────────

function RuleTestModal(props: { rule: any; onClose: () => void }) {
  const fmt = useCurrency();
  const [transactions, setTransactions] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    void loadTransactions();
  });

  async function loadTransactions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions");
      if (!res.ok) {
        setError(`Failed to load transactions (${res.status})`);
        return;
      }
      const data = (await res.json()) as any;
      const allTx = data.transactions ?? [];

      const conditionsOp = props.rule.conditions_op ?? props.rule.conditionsOp ?? "and";
      const conditionsStr = props.rule.conditions ?? "[]";

      const matched = allTx.filter((tx: any) =>
        ruleMatchesTransaction(conditionsStr, conditionsOp, tx),
      );
      setTransactions(matched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }

  const conditionsStr = props.rule.conditions ?? "[]";
  let conditionsLabel = conditionsStr.slice(0, 120);
  try {
    const parsed = JSON.parse(conditionsStr) as Array<any>;
    conditionsLabel = parsed
      .map((c: any) => `${c.field} ${c.op} ${Array.isArray(c.value) ? c.value.join(", ") : c.value}${c.value2 != null ? `-${c.value2}` : ""}`)
      .join(", ");
  } catch { /* use raw string */ }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Test Rule</h2>
          <button class="modal-close" onClick={props.onClose}>✕</button>
        </div>
        <div class="modal-body">
          <div class="rule-test-info">
            <strong>Conditions:</strong> {conditionsLabel}
          </div>
          <div class="rule-test-info" style={{ "margin-top": "0.5rem" }}>
            <strong>Actions:</strong> {summarizeActions(props.rule.actions)}
          </div>

          <Show when={loading()}>
            <div class="loading" style={{ "margin-top": "1rem" }}>Loading transactions...</div>
          </Show>

          <Show when={error()}>
            <div class="error-message" style={{ "margin-top": "1rem" }}>{error()}</div>
          </Show>

          <Show when={!loading() && !error()}>
            <div class="rule-test-count" style={{ "margin-top": "1rem" }}>
              <strong>{transactions().length}</strong> transaction{transactions().length !== 1 ? "s" : ""} match{transactions().length === 1 ? "es" : ""} this rule
            </div>

            <Show
              when={transactions().length > 0}
              fallback={<p style={{ "margin-top": "1rem", color: "var(--text-muted)" }}>No transactions match this rule.</p>}
            >
              <div class="table-wrapper" style={{ "margin-top": "0.75rem", "max-height": "400px", overflow: "auto" }}>
                <table class="tx-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Payee</th>
                      <th>Amount</th>
                      <th>Category</th>
                      <th>Account</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={transactions()}>
                      {(tx) => (
                        <tr>
                          <td class="tx-col-date">{tx.date?.slice(0, 10)}</td>
                          <td>{tx.payee ?? ""}</td>
                          <td class="tx-col-amount">{fmt().formatCents(tx.amount ?? 0)}</td>
                          <td>{tx.category_name ?? ""}</td>
                          <td>{tx.account_name ?? ""}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Show>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onClick={props.onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function summarizeActions(actionsJson: string): string {
  try {
    const actions = JSON.parse(actionsJson) as Array<any>;
    return actions
      .map((a: any) => {
        if (a.op === "delete-transaction") return "Delete transaction";
        if (a.op === "prepend-notes") return `Prepend notes: "${(a.value ?? "").slice(0, 30)}"`;
        if (a.op === "append-notes") return `Append notes: "${(a.value ?? "").slice(0, 30)}"`;
        if (a.op === "set") return `Set ${a.field} to "${(a.value ?? "").slice(0, 30)}"`;
        return `${a.op}: ${(a.value ?? "").slice(0, 30)}`;
      })
      .join("; ");
  } catch {
    return actionsJson?.slice(0, 80) ?? "";
  }
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

const ACTION_OP_LABELS: Record<string, string> = {
  set: "Set field",
  "prepend-notes": "Prepend notes",
  "append-notes": "Append notes",
  "delete-transaction": "Delete transaction",
};

function RuleForm(props: { onClose: () => void }) {
  const [conditionField, setConditionField] = createSignal("payee");
  const [conditionOp, setConditionOp] = createSignal("contains");
  const [conditionValue, setConditionValue] = createSignal("");
  const [conditionValue2, setConditionValue2] = createSignal("");
  const [actionOp, setActionOp] = createSignal("set");
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
    let actions: any[];

    if (actionOp() === "delete-transaction") {
      actions = [{ op: "delete-transaction" }];
    } else if (actionOp() === "set") {
      actions = [{ op: "set", field: actionField(), value: actionValue().trim() }];
    } else {
      actions = [{ op: actionOp(), value: actionValue().trim() }];
    }

    dispatch("create_rule", {
      rule: { conditions, actions: JSON.stringify(actions) },
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
            <select value={actionOp()} onChange={(e) => setActionOp(e.currentTarget.value)}>
              <For each={Object.entries(ACTION_OP_LABELS)}>
                {([value, label]) => <option value={value}>{label}</option>}
              </For>
            </select>

            <Show when={actionOp() === "set"}>
              <select value={actionField()} onChange={(e) => setActionField(e.currentTarget.value)}>
                <option value="category">Field: category</option>
                <option value="payee">Field: payee</option>
                <option value="notes">Field: notes</option>
              </select>
              <input
                type="text"
                placeholder="Value..."
                value={actionValue()}
                onInput={(e) => setActionValue(e.currentTarget.value)}
                required={actionOp() === "set"}
              />
            </Show>

            <Show when={actionOp() === "prepend-notes" || actionOp() === "append-notes"}>
              <input
                type="text"
                placeholder="Note text..."
                value={actionValue()}
                onInput={(e) => setActionValue(e.currentTarget.value)}
                required
              />
            </Show>

            <Show when={actionOp() === "delete-transaction"}>
              <span style={{ color: "var(--text-muted)", "font-size": "0.85rem" }}>
                Transaction will be deleted
              </span>
            </Show>
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
