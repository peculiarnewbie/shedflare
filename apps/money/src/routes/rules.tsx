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
        const data = await res.json() as any;
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
                <div class="rule-card">
                  <div class="rule-info">
                    <div class="rule-conditions">
                      Conditions: {rule.conditions?.slice(0, 80)}...
                    </div>
                    <div class="rule-actions-summary">
                      Actions: {rule.actions?.slice(0, 80)}...
                    </div>
                  </div>
                  <button class="btn btn-icon btn-ghost btn-xs" onClick={() => handleDelete(rule.id)}>
                    🗑️
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function RuleForm(props: { onClose: () => void }) {
  const [conditionField, setConditionField] = createSignal("payee");
  const [conditionOp, setConditionOp] = createSignal("contains");
  const [conditionValue, setConditionValue] = createSignal("");
  const [actionField, setActionField] = createSignal("category");
  const [actionValue, setActionValue] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!conditionValue().trim() || !actionValue().trim()) return;

    setSaving(true);

    const conditions = JSON.stringify([
      { field: conditionField(), op: conditionOp(), value: conditionValue().trim() },
    ]);
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
          <button class="modal-close" onClick={props.onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <h3>Condition</h3>
          <div class="form-row">
            <select value={conditionField()} onChange={(e) => setConditionField(e.currentTarget.value)}>
              <option value="payee">Payee</option>
              <option value="imported_description">Description</option>
              <option value="notes">Notes</option>
            </select>
            <select value={conditionOp()} onChange={(e) => setConditionOp(e.currentTarget.value)}>
              <option value="is">is</option>
              <option value="contains">contains</option>
              <option value="matches">matches (regex)</option>
              <option value="isnot">is not</option>
            </select>
            <input
              type="text"
              placeholder="Value..."
              value={conditionValue()}
              onInput={(e) => setConditionValue(e.currentTarget.value)}
              required
            />
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
            <button type="button" class="btn btn-ghost" onClick={props.onClose}>Cancel</button>
            <button type="submit" class="btn btn-primary" disabled={saving()}>
              {saving() ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
