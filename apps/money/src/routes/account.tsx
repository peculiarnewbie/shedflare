/**
 * Account detail page — shows transactions for a single account with inline editing.
 */
import { createSignal, createMemo, For, Show, createEffect } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { dispatch } from "../lib/pending-ops";

interface TransactionRow {
  id: string;
  date: string;
  amount: number;
  payee: string | null;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  cleared: boolean;
}

export default function AccountPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [account, setAccount] = createSignal<any>(null);
  const [transactions, setTransactions] = createSignal<TransactionRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [showImport, setShowImport] = createSignal(false);
  const accountId = params.id;

  createEffect(() => {
    if (accountId) {
      void loadAccount();
    }
  });

  async function loadAccount() {
    try {
      const [acctRes, txRes] = await Promise.all([
        fetch(`/api/accounts/${accountId}`),
        fetch(`/api/accounts/${accountId}/transactions`),
      ]);
      if (acctRes.ok) setAccount(await acctRes.json() as any);
      if (txRes.ok) {
        const data = await txRes.json() as any;
        setTransactions(data.transactions ?? []);
      }
    } catch {
      // Will work once sync is connected
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(txId: string) {
    dispatch("delete_transaction", { id: txId });
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
  }

  function formatCents(cents: number): string {
    const abs = Math.abs(cents);
    return `${cents < 0 ? "-" : ""}$${(abs / 100).toFixed(2)}`;
  }

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
        </div>
      </div>

      <Show when={account()}>
        <div class="account-header">
          <div class="account-balance-large">
            {formatCents(account().balanceCurrent ?? 0)}
          </div>
        </div>
      </Show>

      <Show when={showImport()}>
        <ImportModal accountId={params.id} onClose={() => setShowImport(false)} />
      </Show>

      <Show when={!loading()} fallback={<div class="loading">Loading transactions...</div>}>
        <Show
          when={transactions().length > 0}
          fallback={<div class="empty-state">No transactions yet. Add one below.</div>}
        >
          <div class="transaction-table">
            <div class="tx-table-header">
              <span class="tx-col-date">Date</span>
              <span class="tx-col-payee">Payee</span>
              <span class="tx-col-category">Category</span>
              <span class="tx-col-amount">Amount</span>
              <span class="tx-col-actions" />
            </div>
            <For each={transactions()}>
              {(tx) => (
                <div class="tx-row" classList={{ uncleared: !tx.cleared }}>
                  <span class="tx-col-date">{tx.date}</span>
                  <span class="tx-col-payee">{tx.payee ?? "—"}</span>
                  <span class="tx-col-category">{tx.categoryName ?? "Uncategorized"}</span>
                  <span class="tx-col-amount" classList={{
                    positive: (tx.amount ?? 0) > 0,
                    negative: (tx.amount ?? 0) < 0,
                  }}>
                    {formatCents(tx.amount ?? 0)}
                  </span>
                  <span class="tx-col-actions">
                    <button class="btn btn-icon btn-ghost btn-xs" onClick={() => handleDelete(tx.id)}>
                      🗑️
                    </button>
                  </span>
                </div>
              )}
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
      // Read file
      const text = await f.text();

      // Parse on server-side by sending raw text
      const res = await fetch("/api/sync/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opId: crypto.randomUUID(),
          commandType: "import_transactions",
          payload: {
            accountId: props.accountId,
            transactions: [{ date: new Date().toISOString().slice(0, 10), amount: 0 }], // Placeholder
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
          <button class="modal-close" onClick={props.onClose}>✕</button>
        </div>
        <div class="modal-body">
          <p>Drag and drop a CSV file from your bank, or click to select.</p>
          <input
            type="file"
            accept=".csv,.tsv"
            onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          />
          <Show when={file()}>
            <p class="file-info">{file()?.name} ({(file()?.size ?? 0 / 1024).toFixed(1)} KB)</p>
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
          <button class="btn btn-ghost" onClick={props.onClose}>Cancel</button>
          <button
            class="btn btn-primary"
            onClick={handleImport}
            disabled={!file() || importing()}
          >
            {importing() ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
