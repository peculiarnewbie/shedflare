/**
 * Payees page — manage and merge payees.
 */
import { createSignal, For, Show, createEffect } from "solid-js";
import { dispatch } from "../lib/pending-ops";

export default function PayeesPage() {
  const [payees, setPayees] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [newName, setNewName] = createSignal("");
  const [mergeSource, setMergeSource] = createSignal<string>("");
  const [mergeTarget, setMergeTarget] = createSignal<string>("");

  createEffect(() => {
    void loadPayees();
  });

  async function loadPayees() {
    try {
      const res = await fetch("/api/payees");
      if (res.ok) {
        const data = (await res.json()) as any;
        setPayees(data.payees ?? []);
      }
    } catch {
      // Will work once sync is connected
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    const name = newName().trim();
    if (!name) return;
    dispatch("create_payee", { name });
    setNewName("");
    // Refresh
    void loadPayees();
  }

  function handleMerge() {
    if (!mergeSource() || !mergeTarget()) return;
    dispatch("merge_payees", { targetId: mergeTarget(), sourceIds: [mergeSource()] });
    setMergeSource("");
    setMergeTarget("");
    void loadPayees();
  }

  function handleFavorite(id: string, favorite: boolean) {
    dispatch("update_payee", { id, favorite });
  }

  return (
    <div class="page">
      <h1 class="page-title">Payees</h1>
      <p class="page-subtitle">Manage transaction payees and merge duplicates</p>

      {/* Add payee */}
      <div class="inline-form">
        <input
          type="text"
          placeholder="New payee name..."
          value={newName()}
          onInput={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button class="btn btn-primary btn-sm" onClick={handleCreate} disabled={!newName().trim()}>
          Add
        </button>
      </div>

      {/* Merge payees */}
      <div class="merge-section">
        <h3>Merge Payees</h3>
        <div class="inline-form">
          <select value={mergeSource()} onChange={(e) => setMergeSource(e.currentTarget.value)}>
            <option value="">Source (will be merged)</option>
            <For each={payees()}>{(p) => <option value={p.id}>{p.name}</option>}</For>
          </select>
          <span>→</span>
          <select value={mergeTarget()} onChange={(e) => setMergeTarget(e.currentTarget.value)}>
            <option value="">Target (will remain)</option>
            <For each={payees()}>{(p) => <option value={p.id}>{p.name}</option>}</For>
          </select>
          <button
            class="btn btn-secondary btn-sm"
            onClick={handleMerge}
            disabled={!mergeSource() || !mergeTarget()}
          >
            Merge
          </button>
        </div>
      </div>

      {/* Payee list */}
      <Show when={!loading()} fallback={<div class="loading">Loading payees...</div>}>
        <Show when={payees().length > 0} fallback={<div class="empty-state">No payees yet.</div>}>
          <div class="payee-list">
            <For each={payees()}>
              {(payee) => (
                <div class="payee-row">
                  <span class="payee-name">{payee.name}</span>
                  <span class="payee-count">{payee.transactionCount ?? 0} txns</span>
                  <button
                    class="btn btn-icon btn-ghost btn-xs"
                    onClick={() => handleFavorite(payee.id, !payee.favorite)}
                  >
                    {payee.favorite ? "★" : "☆"}
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
