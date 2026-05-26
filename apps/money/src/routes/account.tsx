import { createSignal, createMemo, createEffect, For, Show, onCleanup } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { dispatch } from "../lib/pending-ops";
import { execute } from "../lib/api";
import { useCurrency } from "../lib/currency";
import { usePrivacyMode } from "../lib/privacy";
import TransactionFilters from "../components/TransactionFilters";
import TransactionTable from "../components/TransactionTable";
import { PageState } from "../components/PageState";
import type { TransactionRow } from "../components/TransactionTable";
import type { Condition } from "../components/TransactionFilters";

interface CategoryRow {
  id: string;
  name: string;
  groupName: string | null;
}

export default function AccountPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [account, setAccount] = createSignal<any>(null);
  const [transactions, setTransactions] = createSignal<TransactionRow[]>([]);
  const [categories, setCategories] = createSignal<CategoryRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [showImport, setShowImport] = createSignal(false);
  const [showAddTx, setShowAddTx] = createSignal(false);
  const [showReconcile, setShowReconcile] = createSignal(false);
  const accountId = params.id;
  const fmt = useCurrency();
  const privacyBlur = usePrivacyMode();

  const [filterId, setFilterId] = createSignal<string | null>(null);
  const [filterConditions, setFilterConditions] = createSignal<Condition[]>([]);
  const [_filterConditionsOp, setFilterConditionsOp] = createSignal<"and" | "or">("and");

  const [tagList, setTagList] = createSignal<any[]>([]);
  const [txTags, setTxTags] = createSignal<
    Record<string, { id: string; name: string; color: string | null }[]>
  >({});

  const reconciliableTransactions = createMemo(() =>
    transactions().filter((tx) => tx.cleared && !tx.reconciled && !tx.isChild),
  );

  const [txDate, setTxDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [txPayee, setTxPayee] = createSignal("");
  const [txAmount, setTxAmount] = createSignal("");
  const [txCategory, setTxCategory] = createSignal("");
  const [txNotes, setTxNotes] = createSignal("");
  const [autoCategory, setAutoCategory] = createSignal<string | null>(null);

  let payeeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  onCleanup(() => {
    if (payeeDebounceTimer) clearTimeout(payeeDebounceTimer);
  });

  function handlePayeeInput(value: string) {
    setTxPayee(value);

    if (payeeDebounceTimer) clearTimeout(payeeDebounceTimer);

    if (!value.trim()) {
      setAutoCategory(null);
      return;
    }

    payeeDebounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/payees/category-suggestions?payee=${encodeURIComponent(value.trim())}`,
        );
        if (res.ok) {
          const data = (await res.json()) as any;
          const suggestions = data.suggestions ?? [];
          if (suggestions.length > 0) {
            setAutoCategory(suggestions[0].category_id);
          } else {
            setAutoCategory(null);
          }
        }
      } catch {
        setAutoCategory(null);
      }
    }, 300);
  }

  createEffect(() => {
    const autoCat = autoCategory();
    if (autoCat && (!txCategory() || txCategory() === "")) {
      setTxCategory(autoCat);
    }
  });

  function handleFilterChange(
    conditions: Condition[],
    conditionsOp: "and" | "or",
    fId: string | null,
  ) {
    setFilterConditions(conditions);
    setFilterConditionsOp(conditionsOp);
    setFilterId(fId);
    setLoading(true);
    void loadAccount();
  }

  createEffect(() => {
    if (accountId) {
      void loadAccount();
      void loadCategories();
      void loadTags();
    }
  });

  async function loadAccount() {
    setError(null);
    try {
      const fId = filterId();
      const filterParam = fId ? `?filter=${encodeURIComponent(fId)}` : "";
      const [acctRes, txRes, txTagsRes] = await Promise.all([
        fetch(`/api/accounts/${accountId}`),
        fetch(`/api/accounts/${accountId}/transactions${filterParam}`),
        fetch(`/api/accounts/${accountId}/tags`),
      ]);
      if (acctRes.ok) setAccount((await acctRes.json()) as any);
      if (txRes.ok) {
        const data = (await txRes.json()) as any;
        setTransactions(data.transactions ?? []);
      }
      if (txTagsRes.ok) {
        const data = (await txTagsRes.json()) as any;
        const map: Record<string, { id: string; name: string; color: string | null }[]> = {};
        for (const tt of data.transactionTags ?? []) {
          const txId = String(tt.transaction_id);
          if (!map[txId]) map[txId] = [];
          map[txId].push({
            id: String(tt.tag_id),
            name: String(tt.tag_name),
            color: tt.tag_color ? String(tt.tag_color) : null,
          });
        }
        setTxTags(map);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account");
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

  async function loadTags() {
    try {
      const res = await fetch("/api/tags");
      if (res.ok) {
        const data = (await res.json()) as any;
        setTagList(data.tags ?? []);
      }
    } catch {
      // ignore
    }
  }

  function handleAddTransaction(e: Event) {
    e.preventDefault();
    const raw = txAmount();
    const cents = fmt().parseInput(raw);
    if (cents === 0) return;

    dispatch("create_transaction", {
      row: {
        accountId,
        date: txDate(),
        amount: cents,
        payee: txPayee() || undefined,
        notes: txNotes() || undefined,
        categoryId: txCategory() || null,
        cleared: true,
      },
    });

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

  const runningBalance = createMemo(() =>
    transactions().reduce((sum, tx) => sum + (tx.amount ?? 0), 0),
  );

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
          <button class="btn btn-secondary btn-sm" onClick={() => setShowReconcile(true)}>
            Reconcile
          </button>
          <button class="btn btn-ghost btn-sm" onClick={handleCloseAccount}>
            Close Account
          </button>
        </div>
      </div>

      <Show when={account()}>
        <div class="account-header">
          <div class={`account-balance-large ${privacyBlur().blurClass()}`}>
            {fmt().formatCents(runningBalance() || (account().balanceCurrent ?? 0))}
          </div>
          <Show when={account().lastReconciled}>
            <div class="account-reconciled-info">Last reconciled: {account().lastReconciled}</div>
          </Show>
        </div>
      </Show>

      <TransactionFilters
        accountId={params.id}
        activeConditions={filterConditions()}
        onConditionsChange={handleFilterChange}
      />

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
                  list="tx-payee-list"
                  placeholder="e.g. Grocery Store"
                  value={txPayee()}
                  onInput={(e) => handlePayeeInput(e.currentTarget.value)}
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

      <Show when={showReconcile()}>
        <ReconcileModal
          accountId={params.id}
          runningBalance={runningBalance()}
          transactions={reconciliableTransactions()}
          onClose={() => {
            setShowReconcile(false);
          }}
          onFinish={() => {
            setShowReconcile(false);
            void loadAccount();
          }}
        />
      </Show>

      <PageState
        loading={loading()}
        error={error()}
        onRetry={loadAccount}
        loadingMessage="Loading transactions..."
      >
        <Show
          when={transactions().length > 0}
          fallback={<div class="empty-state">No transactions yet.</div>}
        >
          <TransactionTable
            transactions={transactions()}
            categories={categories()}
            txTags={txTags()}
            tagList={tagList()}
            showBalance
            onCreateSchedule={(tx) => {
              dispatch("create_schedule", {
                schedule: {
                  name: tx.payee ?? "From transaction",
                  amount: tx.amount,
                  recurrenceRules: JSON.stringify({ type: "monthly" }),
                  startDate: new Date().toISOString().slice(0, 10),
                },
              });
            }}
          />
        </Show>
      </PageState>
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
      const result = await execute("import_transactions", {
        accountId: props.accountId,
        transactions: [{ date: new Date().toISOString().slice(0, 10), amount: 0 }],
        isPreview: false,
      });
      if (result.ok) {
        setResult({ added: 0, errors: [] });
      } else {
        setResult({ added: 0, errors: [result.error] });
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

function ReconcileModal(props: {
  accountId: string;
  runningBalance: number;
  transactions: TransactionRow[];
  onClose: () => void;
  onFinish: () => void;
}) {
  const fmt = useCurrency();
  const [statementBalance, setStatementBalance] = createSignal("");
  const [processing, setProcessing] = createSignal(false);
  const [done, setDone] = createSignal(false);

  const handleClose = () => {
    setStatementBalance("");
    props.onClose();
  };

  const handleDone = () => {
    setStatementBalance("");
    props.onFinish();
  };

  const diff = createMemo(() => {
    const sb = fmt().parseInput(statementBalance());
    return sb - props.runningBalance;
  });

  const isBalanced = () => diff() === 0;

  async function handleFinish() {
    setProcessing(true);

    const now = new Date().toISOString();
    const promises: Promise<unknown>[] = [];

    for (const tx of props.transactions) {
      promises.push(
        dispatch("update_transaction", {
          id: tx.id,
          fields: { reconciled: true },
        }).promise,
      );
    }

    if (!isBalanced()) {
      promises.push(
        dispatch("create_transaction", {
          row: {
            accountId: props.accountId,
            date: now.slice(0, 10),
            amount: -diff(),
            payee: "Reconciliation Adjustment",
            notes: "Balance adjustment from reconciliation",
            cleared: true,
            reconciled: true,
          },
        }).promise,
      );
    }

    promises.push(
      dispatch("update_account", {
        id: props.accountId,
        lastReconciled: now,
      }).promise,
    );

    await Promise.all(promises);
    setProcessing(false);
    setDone(true);
  }

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Reconcile Account</h2>
          <button class="modal-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        <Show
          when={!done()}
          fallback={
            <div class="modal-body" style={{ "text-align": "center", padding: "24px" }}>
              <p style={{ "font-size": "1.1rem", "margin-bottom": "16px" }}>
                ✓ Reconciliation complete
              </p>
              <p style={{ color: "var(--text-secondary)" }}>
                {props.transactions.length} transactions marked as reconciled.
                {!isBalanced() ? " An adjustment transaction was created." : ""}
              </p>
              <div class="form-actions" style={{ "margin-top": "24px" }}>
                <button class="btn btn-primary" onClick={handleDone}>
                  Done
                </button>
              </div>
            </div>
          }
        >
          <div class="modal-body">
            <div class="reconcile-summary">
              <div class="reconcile-row">
                <span class="reconcile-label">Running balance:</span>
                <span class="reconcile-value">{fmt().formatCents(props.runningBalance)}</span>
              </div>
              <div class="reconcile-row">
                <span class="reconcile-label">Statement balance:</span>
                <input
                  type="number"
                  step={fmt().code === "IDR" ? "1" : "0.01"}
                  class="reconcile-input"
                  placeholder="0"
                  value={statementBalance()}
                  onInput={(e) => setStatementBalance(e.currentTarget.value)}
                  autofocus
                />
              </div>
              <div
                class="reconcile-row reconcile-diff"
                classList={{
                  "reconcile-balanced": isBalanced(),
                  "reconcile-negative": diff() < 0,
                  "reconcile-positive": diff() > 0,
                }}
              >
                <span class="reconcile-label">Difference:</span>
                <span class="reconcile-value">{fmt().formatCents(diff())}</span>
              </div>
            </div>

            <Show when={(props.transactions.length ?? 0) === 0}>
              <p style={{ color: "var(--text-muted)", "margin-top": "16px" }}>
                No cleared transactions to reconcile.
              </p>
            </Show>

            <Show when={!isBalanced() && statementBalance() !== ""}>
              <div class="reconcile-adjustment-note">
                {diff() > 0
                  ? "An adjustment transaction will credit the account."
                  : "An adjustment transaction will debit the account."}
              </div>
            </Show>
          </div>

          <div class="form-actions">
            <button class="btn btn-ghost" onClick={handleClose}>
              Cancel
            </button>
            <button
              class="btn btn-primary"
              onClick={handleFinish}
              disabled={processing() || statementBalance() === ""}
            >
              {processing() ? "Reconciling..." : "Finish Reconciliation"}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
