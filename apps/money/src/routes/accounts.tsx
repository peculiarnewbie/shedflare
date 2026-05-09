/**
 * Accounts page — list of all accounts with balances.
 */
import { createSignal, createMemo, For, Show, createEffect } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { dispatch } from "../lib/pending-ops";

interface AccountRow {
  id: string;
  name: string;
  offbudget: boolean;
  closed: boolean;
  balanceCurrent: number | null;
  sortOrder: number;
}

export default function AccountsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = createSignal<AccountRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newOffBudget, setNewOffBudget] = createSignal(false);
  const [newBalance, setNewBalance] = createSignal("");

  createEffect(() => {
    void loadAccounts();
  });

  async function loadAccounts() {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = (await res.json()) as any;
        setAccounts(data.accounts ?? []);
      }
    } catch {
      // Will work once sync is connected
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    const name = newName().trim();
    if (!name) return;

    const balance = parseFloat(newBalance());
    dispatch("create_account", {
      name,
      offBudget: newOffBudget(),
      balance: isNaN(balance) ? undefined : Math.round(balance * 100),
    });

    setShowAddForm(false);
    setNewName("");
    setNewOffBudget(false);
    setNewBalance("");
    // Reload
    await loadAccounts();
  }

  function formatBalance(balance: number | null): string {
    if (balance === null) return "—";
    const abs = Math.abs(balance);
    return `${balance < 0 ? "-" : ""}$${(abs / 100).toFixed(2)}`;
  }

  // Separate on-budget and off-budget accounts
  const onBudgetAccounts = createMemo(() => accounts().filter((a) => !a.offbudget && !a.closed));
  const offBudgetAccounts = createMemo(() => accounts().filter((a) => a.offbudget && !a.closed));
  const closedAccounts = createMemo(() => accounts().filter((a) => a.closed));

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Accounts</h1>
        <button class="btn btn-primary btn-sm" onClick={() => setShowAddForm(true)}>
          + Add Account
        </button>
      </div>

      <Show when={showAddForm()}>
        <div class="modal-overlay" onClick={() => setShowAddForm(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h2>Add Account</h2>
              <button class="modal-close" onClick={() => setShowAddForm(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div class="form-group">
                <label>Name</label>
                <input
                  type="text"
                  placeholder="e.g. Checking, Savings, Credit Card"
                  value={newName()}
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  required
                  autofocus
                />
              </div>
              <div class="form-group">
                <label>Starting Balance (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newBalance()}
                  onInput={(e) => setNewBalance(e.currentTarget.value)}
                />
              </div>
              <div class="form-check">
                <input
                  type="checkbox"
                  id="off-budget"
                  checked={newOffBudget()}
                  onChange={(e) => setNewOffBudget(e.currentTarget.checked)}
                />
                <label for="off-budget">Off-budget (e.g. credit card, investment)</label>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      <Show when={!loading()} fallback={<div class="loading">Loading accounts...</div>}>
        <RenderAccountGroup
          title="On Budget"
          accounts={onBudgetAccounts()}
          navigate={navigate}
          formatBalance={formatBalance}
        />
        <RenderAccountGroup
          title="Off Budget"
          accounts={offBudgetAccounts()}
          navigate={navigate}
          formatBalance={formatBalance}
        />
        <RenderAccountGroup
          title="Closed"
          accounts={closedAccounts()}
          navigate={navigate}
          formatBalance={formatBalance}
        />
      </Show>
    </div>
  );
}

function RenderAccountGroup(props: {
  title: string;
  accounts: AccountRow[];
  navigate: (path: string) => void;
  formatBalance: (b: number | null) => string;
}) {
  return (
    <Show when={props.accounts.length > 0}>
      <div class="section">
        <h2 class="section-title">{props.title}</h2>
        <div class="account-list">
          <For each={props.accounts}>
            {(account) => (
              <div class="account-card" onClick={() => props.navigate(`/accounts/${account.id}`)}>
                <div class="account-info">
                  <div class="account-name">{account.name}</div>
                </div>
                <div class="account-balance">{props.formatBalance(account.balanceCurrent)}</div>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
