import { createSignal, createMemo, createEffect, For, Show, onCleanup } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { dispatch } from "../lib/pending-ops";
import { transactionsCollection, categoriesCollection } from "../lib/collections";
import { useCurrency } from "../lib/currency";

interface TransactionRow {
  id: string;
  date: string;
  amount: number;
  payee: string | null;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  cleared: boolean;
  reconciled: boolean;
  isParent?: boolean;
  isChild?: boolean;
  parentId?: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  groupName: string | null;
}

type TxField = "date" | "payee" | "amount" | "category" | "notes";

interface SplitChild {
  tempId: string;
  categoryId: string;
  amount: string;
  notes: string;
}

export default function AccountPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [account, setAccount] = createSignal<any>(null);
  const [transactions, setTransactions] = createSignal<TransactionRow[]>([]);
  const [categories, setCategories] = createSignal<CategoryRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [showImport, setShowImport] = createSignal(false);
  const [showAddTx, setShowAddTx] = createSignal(false);
  const accountId = params.id;
  const fmt = useCurrency();

  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editingField, setEditingField] = createSignal<TxField | null>(null);

  const [txDate, setTxDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [txPayee, setTxPayee] = createSignal("");
  const [txAmount, setTxAmount] = createSignal("");
  const [txCategory, setTxCategory] = createSignal("");
  const [txNotes, setTxNotes] = createSignal("");

  const [splitParentId, setSplitParentId] = createSignal<string | null>(null);
  const [splitChildren, setSplitChildren] = createSignal<SplitChild[]>([]);

  function initSplit(parent: TransactionRow) {
    setSplitParentId(parent.id);
    setSplitChildren([{ tempId: crypto.randomUUID(), categoryId: "", amount: "", notes: "" }]);
  }

  function addSplitChild() {
    setSplitChildren((prev) => [
      ...prev,
      { tempId: crypto.randomUUID(), categoryId: "", amount: "", notes: "" },
    ]);
  }

  function updateSplitChild(tempId: string, field: keyof SplitChild, value: string) {
    setSplitChildren((prev) =>
      prev.map((c) => (c.tempId === tempId ? { ...c, [field]: value } : c)),
    );
  }

  function cancelSplit() {
    setSplitParentId(null);
    setSplitChildren([]);
  }

  function saveSplit() {
    const parentId = splitParentId();
    if (!parentId) return;

    const parent = transactions().find((t) => t.id === parentId);
    if (!parent) return;

    const children = splitChildren()
      .map((c) => {
        const cents = fmt().parseInput(c.amount);
        if (cents === 0) return null;
        return {
          accountId: accountId,
          date: parent.date,
          amount: cents,
          categoryId: c.categoryId || null,
          notes: c.notes || undefined,
          payee: parent.payee || undefined,
        };
      })
      .filter(Boolean);

    if (children.length === 0) return;

    dispatch("split_transaction", { parentId, children });

    cancelSplit();
  }

  const payeeNames = createMemo(() => {
    const names = new Set<string>();
    for (const tx of transactions()) {
      if (tx.payee) names.add(tx.payee);
    }
    return [...names].sort();
  });

  createEffect(() => {
    if (accountId) {
      void loadAccount();
      void loadCategories();
    }
  });

  createEffect(() => {
    const unsub1 = transactionsCollection.subscribeChanges(() => {
      void loadAccount();
    });
    const unsub2 = categoriesCollection.subscribeChanges(() => {
      void loadCategories();
    });
    onCleanup(() => {
      unsub1.unsubscribe();
      unsub2.unsubscribe();
    });
  });

  async function loadAccount() {
    try {
      const [acctRes, txRes] = await Promise.all([
        fetch(`/api/accounts/${accountId}`),
        fetch(`/api/accounts/${accountId}/transactions`),
      ]);
      if (acctRes.ok) setAccount((await acctRes.json()) as any);
      if (txRes.ok) {
        const data = (await txRes.json()) as any;
        if (data.transactions && data.transactions.length > 0) {
          setTransactions(data.transactions);
        }
      }
    } catch {
      // Will work once sync is connected
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = (await res.json()) as any;
        setCategories(data.categories ?? []);
      }
    } catch {
      // ignore
    }
  }

  async function handleDelete(txId: string) {
    if (!confirm("Delete this transaction?")) return;
    dispatch("delete_transaction", { id: txId });
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
  }

  function handleAddTransaction(e: Event) {
    e.preventDefault();
    const raw = txAmount();
    const cents = fmt().parseInput(raw);
    if (cents === 0) return;

    const payload = {
      row: {
        accountId,
        date: txDate(),
        amount: cents,
        payee: txPayee() || undefined,
        notes: txNotes() || undefined,
        categoryId: txCategory() || null,
        cleared: true,
      },
    };

    dispatch("create_transaction", payload);

    setTransactions((prev) => [
      {
        id: `pending_${Date.now()}`,
        date: txDate(),
        amount: cents,
        payee: txPayee() || null,
        categoryId: txCategory() || null,
        categoryName: categories().find((c) => c.id === txCategory())?.name ?? null,
        notes: txNotes() || null,
        cleared: true,
        reconciled: false,
      },
      ...prev,
    ]);

    setTxDate(new Date().toISOString().slice(0, 10));
    setTxPayee("");
    setTxAmount("");
    setTxCategory("");
    setTxNotes("");
    setShowAddTx(false);
  }

  function handleCloseAccount() {
    if (!confirm("Close this account? It will be hidden from most views.")) return;
    dispatch("close_account", { id: accountId });
    navigate("/accounts");
  }

  function startEdit(txId: string, field: TxField) {
    setEditingId(txId);
    setEditingField(field);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingField(null);
  }

  function saveEdit(tx: TransactionRow, field: TxField, value: string) {
    if (field === "amount") {
      const cents = fmt().parseInput(value);
      if (cents !== tx.amount) {
        dispatch("update_transaction", {
          id: tx.id,
          fields: { amount: cents },
        });
        setTransactions((prev) => prev.map((t) => (t.id === tx.id ? { ...t, amount: cents } : t)));
      }
    } else if (field === "date") {
      if (value !== tx.date) {
        dispatch("update_transaction", {
          id: tx.id,
          fields: { date: value },
        });
        setTransactions((prev) => prev.map((t) => (t.id === tx.id ? { ...t, date: value } : t)));
      }
    } else if (field === "payee") {
      if (value !== (tx.payee ?? "")) {
        dispatch("update_transaction", {
          id: tx.id,
          fields: { payee: value || undefined },
        });
        setTransactions((prev) =>
          prev.map((t) => (t.id === tx.id ? { ...t, payee: value || null } : t)),
        );
      }
    } else if (field === "notes") {
      if (value !== (tx.notes ?? "")) {
        dispatch("update_transaction", {
          id: tx.id,
          fields: { notes: value || undefined },
        });
        setTransactions((prev) =>
          prev.map((t) => (t.id === tx.id ? { ...t, notes: value || null } : t)),
        );
      }
    } else if (field === "category") {
      const catId = value || null;
      if (catId !== tx.categoryId) {
        dispatch("update_transaction", {
          id: tx.id,
          fields: { categoryId: catId },
        });
        const catName = categories().find((c) => c.id === catId)?.name ?? null;
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === tx.id ? { ...t, categoryId: catId, categoryName: catName } : t,
          ),
        );
      }
    }
    cancelEdit();
  }

  function toggleCleared(tx: TransactionRow) {
    const next = !tx.cleared;
    dispatch("update_transaction", {
      id: tx.id,
      fields: { cleared: next },
    });
    setTransactions((prev) => prev.map((t) => (t.id === tx.id ? { ...t, cleared: next } : t)));
  }

  function toggleReconciled(tx: TransactionRow) {
    const next = !tx.reconciled;
    dispatch("update_transaction", {
      id: tx.id,
      fields: { reconciled: next },
    });
    setTransactions((prev) => prev.map((t) => (t.id === tx.id ? { ...t, reconciled: next } : t)));
  }

  function formatCents(cents: number): string {
    return fmt().formatCents(cents);
  }

  const transactionsWithBalance = createMemo(() => {
    const txs = [...transactions()].sort(
      (a, b) => new Date(a.date).getTime() - new Date(a.date).getTime(),
    );
    const result: Array<TransactionRow & { balance: number }> = [];
    let balance = 0;
    for (const tx of txs) {
      balance += tx.amount;
      result.push({ ...tx, balance });
    }
    return result.reverse();
  });

  return (
    <div class="page">
      <div class="page-header">
        <button class="btn btn-ghost btn-sm" onClick={() => navigate("/accounts")}>
          ← Back
        </button>
        <h1 class="page-title">{account()?.name ?? params.id}</h1>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>
            Import CSV
          </button>
          <button class="btn btn-secondary btn-sm" onClick={() => setShowAddTx(!showAddTx())}>
            {showAddTx() ? "Cancel" : "+ Add Transaction"}
          </button>
          <button class="btn btn-ghost btn-sm" onClick={handleCloseAccount}>
            Close Account
          </button>
        </div>
      </div>

      <Show when={account()}>
        <div class="account-header">
          <div class="account-balance-large">
            {formatCents(
              transactions().reduce((sum, tx) => sum + tx.amount, 0) ||
                (account().balanceCurrent ?? 0),
            )}
          </div>
        </div>
      </Show>

      <Show when={showAddTx()}>
        <div class="section">
          <form
            onSubmit={handleAddTransaction}
            class="settings-section"
            style={{ display: "flex", "flex-direction": "column", gap: "12px" }}
          >
            <div class="form-row">
              <div class="form-group" style={{ flex: "0 0 140px" }}>
                <label>Date</label>
                <input
                  type="date"
                  value={txDate()}
                  onInput={(e) => setTxDate(e.currentTarget.value)}
                  required
                />
              </div>
              <div class="form-group" style={{ flex: "1" }}>
                <label>Payee</label>
                <input
                  type="text"
                  list="payee-list"
                  placeholder="e.g. Grocery Store"
                  value={txPayee()}
                  onInput={(e) => setTxPayee(e.currentTarget.value)}
                />
              </div>
              <div class="form-group" style={{ flex: "0 0 160px" }}>
                <label>Amount</label>
                <input
                  type="number"
                  step={fmt().code === "IDR" ? "1" : "0.01"}
                  placeholder="0"
                  value={txAmount()}
                  onInput={(e) => setTxAmount(e.currentTarget.value)}
                  required
                />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" style={{ flex: "1" }}>
                <label>Category</label>
                <select value={txCategory()} onChange={(e) => setTxCategory(e.currentTarget.value)}>
                  <option value="">Uncategorized</option>
                  <For each={categories()}>
                    {(cat) => (
                      <option value={cat.id}>
                        {cat.groupName ? `${cat.groupName}: ` : ""}
                        {cat.name}
                      </option>
                    )}
                  </For>
                </select>
              </div>
              <div class="form-group" style={{ flex: "1" }}>
                <label>Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes"
                  value={txNotes()}
                  onInput={(e) => setTxNotes(e.currentTarget.value)}
                />
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">
                Add Transaction
              </button>
            </div>
          </form>
        </div>
      </Show>

      <Show when={showImport()}>
        <ImportModal accountId={params.id} onClose={() => setShowImport(false)} />
      </Show>

      <datalist id="payee-list">
        <For each={payeeNames()}>{(name) => <option value={name} />}</For>
      </datalist>

      <Show when={!loading()} fallback={<div class="loading">Loading transactions...</div>}>
        <Show
          when={transactionsWithBalance().length > 0}
          fallback={<div class="empty-state">No transactions yet.</div>}
        >
          <div class="transaction-table">
            <div class="tx-table-header">
              <span class="tx-col-cr">C/R</span>
              <span class="tx-col-date">Date</span>
              <span class="tx-col-payee">Payee</span>
              <span class="tx-col-category">Category</span>
              <span class="tx-col-amount">Amount ({fmt().symbol})</span>
              <span class="tx-col-balance">Balance</span>
              <span class="tx-col-actions" />
            </div>
            <For each={transactionsWithBalance()}>
              {(tx) => {
                const isEditing = (field: TxField) =>
                  editingId() === tx.id && editingField() === field;
                const isSplitting = splitParentId() === tx.id;

                return (
                  <>
                    <div
                      class="tx-row"
                      classList={{
                        uncleared: !tx.cleared,
                        reconciled: tx.reconciled,
                        "tx-row-parent": tx.isParent,
                        "tx-row-child": tx.isChild,
                      }}
                    >
                      <span class="tx-col-cr">
                        <button
                          class="btn btn-icon btn-xs"
                          classList={{ "btn-ghost": !tx.cleared, "btn-primary": tx.cleared }}
                          style={{ padding: "2px 6px", "font-size": "0.65rem" }}
                          onClick={() => toggleCleared(tx)}
                          title={tx.cleared ? "Cleared" : "Uncleared"}
                        >
                          C
                        </button>
                        <button
                          class="btn btn-icon btn-xs"
                          classList={{
                            "btn-ghost": !tx.reconciled,
                            "btn-reconciled": tx.reconciled,
                          }}
                          style={{ padding: "2px 6px", "font-size": "0.65rem" }}
                          onClick={() => toggleReconciled(tx)}
                          title={tx.reconciled ? "Reconciled" : "Not reconciled"}
                        >
                          🔒
                        </button>
                      </span>

                      <span class="tx-col-date">
                        {isEditing("date") ? (
                          <input
                            type="date"
                            class="tx-inline-input"
                            value={tx.date}
                            onBlur={(e) => saveEdit(tx, "date", e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                saveEdit(tx, "date", (e.target as HTMLInputElement).value);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autofocus
                          />
                        ) : (
                          <span onClick={() => startEdit(tx.id, "date")}>{tx.date}</span>
                        )}
                      </span>

                      <span class="tx-col-payee">
                        {isEditing("payee") ? (
                          <input
                            type="text"
                            list="payee-list"
                            class="tx-inline-input"
                            value={tx.payee ?? ""}
                            onBlur={(e) => saveEdit(tx, "payee", e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                saveEdit(tx, "payee", (e.target as HTMLInputElement).value);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autofocus
                          />
                        ) : (
                          <span onClick={() => startEdit(tx.id, "payee")}>
                            {tx.isParent ? <em>Split</em> : (tx.payee ?? "—")}
                          </span>
                        )}
                      </span>

                      <span class="tx-col-category">
                        {isEditing("category") ? (
                          <select
                            class="tx-inline-select"
                            value={tx.categoryId ?? ""}
                            onBlur={(e) => saveEdit(tx, "category", e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                saveEdit(
                                  tx,
                                  "category",
                                  (e.currentTarget as HTMLSelectElement).value,
                                );
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autofocus
                          >
                            <option value="">Uncategorized</option>
                            <For each={categories()}>
                              {(cat) => (
                                <option value={cat.id}>
                                  {cat.groupName ? `${cat.groupName}: ` : ""}
                                  {cat.name}
                                </option>
                              )}
                            </For>
                          </select>
                        ) : (
                          <span
                            classList={{ "tx-split-label": tx.isParent }}
                            onClick={() => startEdit(tx.id, "category")}
                          >
                            {tx.isParent ? "Split" : (tx.categoryName ?? "Uncategorized")}
                          </span>
                        )}
                      </span>

                      <span
                        class="tx-col-amount"
                        classList={{
                          positive: (tx.amount ?? 0) > 0,
                          negative: (tx.amount ?? 0) < 0,
                          "tx-amount-parent": tx.isParent,
                        }}
                      >
                        {isEditing("amount") ? (
                          <input
                            type="number"
                            step={fmt().code === "IDR" ? "1" : "0.01"}
                            class="tx-inline-input"
                            value={fmt().formatCentsInput(tx.amount ?? 0)}
                            onBlur={(e) => saveEdit(tx, "amount", e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                saveEdit(tx, "amount", (e.target as HTMLInputElement).value);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autofocus
                          />
                        ) : (
                          <span onClick={() => startEdit(tx.id, "amount")}>
                            {formatCents(tx.amount ?? 0)}
                          </span>
                        )}
                      </span>

                      <span class="tx-col-balance">{formatCents(tx.balance)}</span>

                      <span class="tx-col-actions">
                        <button
                          class="btn btn-icon btn-ghost btn-xs"
                          onClick={() => initSplit(tx)}
                          title="Split transaction"
                          disabled={!!tx.isChild || !!tx.isParent}
                        >
                          ⇄
                        </button>
                        <button
                          class="btn btn-icon btn-ghost btn-xs"
                          onClick={() => handleDelete(tx.id)}
                        >
                          🗑️
                        </button>
                      </span>
                    </div>

                    <Show when={isSplitting}>
                      <div class="tx-split-form">
                        <div class="tx-split-children">
                          <For each={splitChildren()}>
                            {(child, idx) => (
                              <div class="tx-split-child">
                                <span class="tx-split-child-num">{idx() + 1}.</span>
                                <select
                                  class="tx-inline-select"
                                  value={child.categoryId}
                                  onChange={(e) =>
                                    updateSplitChild(
                                      child.tempId,
                                      "categoryId",
                                      e.currentTarget.value,
                                    )
                                  }
                                >
                                  <option value="">Category</option>
                                  <For each={categories()}>
                                    {(cat) => (
                                      <option value={cat.id}>
                                        {cat.groupName ? `${cat.groupName}: ` : ""}
                                        {cat.name}
                                      </option>
                                    )}
                                  </For>
                                </select>
                                <input
                                  type="number"
                                  step={fmt().code === "IDR" ? "1" : "0.01"}
                                  class="tx-inline-input"
                                  style={{ width: "120px" }}
                                  placeholder="Amount"
                                  value={child.amount}
                                  onInput={(e) =>
                                    updateSplitChild(child.tempId, "amount", e.currentTarget.value)
                                  }
                                />
                                <input
                                  type="text"
                                  class="tx-inline-input"
                                  style={{ flex: 1 }}
                                  placeholder="Notes"
                                  value={child.notes}
                                  onInput={(e) =>
                                    updateSplitChild(child.tempId, "notes", e.currentTarget.value)
                                  }
                                />
                              </div>
                            )}
                          </For>
                        </div>
                        <div class="tx-split-actions">
                          <button class="btn btn-ghost btn-xs" onClick={addSplitChild}>
                            + Add Child
                          </button>
                          <button class="btn btn-primary btn-xs" onClick={saveSplit}>
                            Save Split
                          </button>
                          <button class="btn btn-ghost btn-xs" onClick={cancelSplit}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </Show>
                  </>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function ImportModal(props: { accountId: string; onClose: () => void }) {
  const [file, setFile] = createSignal<File | null>(null);
  const [importing, setImporting] = createSignal(false);
  const [result, setResult] = createSignal<{ added: number; errors: string[] } | null>(null);

  async function handleImport() {
    const f = file();
    if (!f) return;
    setImporting(true);

    try {
      const text = await f.text();
      const res = await fetch("/api/sync/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opId: crypto.randomUUID(),
          commandType: "import_transactions",
          payload: {
            accountId: props.accountId,
            transactions: [{ date: new Date().toISOString().slice(0, 10), amount: 0 }],
            isPreview: false,
          },
        }),
      });

      if (res.ok) {
        setResult({ added: 0, errors: [] });
      }
    } catch (err) {
      setResult({ added: 0, errors: [err instanceof Error ? err.message : "Import failed"] });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Import CSV</h2>
          <button class="modal-close" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div class="modal-body">
          <p>Drag and drop a CSV file from your bank, or click to select.</p>
          <input
            type="file"
            accept=".csv,.tsv"
            onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          />
          <Show when={file()}>
            <p class="file-info">
              {file()?.name} ({((file()?.size ?? 0) / 1024).toFixed(1)} KB)
            </p>
          </Show>
          <Show when={result()}>
            <div class="import-result">
              <p>Added: {result()?.added} transactions</p>
              <Show when={(result()?.errors.length ?? 0) > 0}>
                <ul>
                  <For each={result()?.errors}>{(err) => <li>{err}</li>}</For>
                </ul>
              </Show>
            </div>
          </Show>
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" onClick={props.onClose}>
            Cancel
          </button>
          <button class="btn btn-primary" onClick={handleImport} disabled={!file() || importing()}>
            {importing() ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
