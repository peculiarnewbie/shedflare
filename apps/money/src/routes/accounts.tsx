/**
 * Accounts page — list of all accounts with balances.
 */
import { createSignal, createMemo, For, Show, createEffect, onCleanup } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { dispatch } from "../lib/pending-ops";
import { api } from "../lib/api";
import { useCurrency } from "../lib/currency";
import { usePrivacyMode } from "../lib/privacy";
import { settingsCollection } from "../lib/collections";
import { PageState } from "../components/PageState";
import { useAccountForm } from "../lib/forms/accounts";

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
  const fmt = useCurrency();
  const privacyBlur = usePrivacyMode();
  const [accounts, setAccounts] = createSignal<AccountRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [hideClosed, setHideClosed] = createSignal(false);

  const { values, errors, setValues, validate, resetForm } = useAccountForm();

  createEffect(() => {
    function sync() {
      const hc = settingsCollection.state.get("hide_closed_accounts")?.value;
      setHideClosed(hc === "true");
    }
    sync();
    const unsub = settingsCollection.subscribeChanges(sync);
    onCleanup(() => unsub.unsubscribe());
  });

  createEffect(() => {
    void loadAccounts();
  });

  async function loadAccounts() {
    setError(null);
    try {
      const data = await api.accounts();
      setAccounts([...data.accounts]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!validate()) return;

    const name = values.name.trim();
    const balance = values.balance ? parseFloat(values.balance) : undefined;
    const op = dispatch("create_account", {
      name,
      offBudget: values.offbudget,
      balance: balance ? Math.round(balance * 100) : undefined,
    });

    setShowAddForm(false);
    resetForm();
    await op.promise;
    await loadAccounts();
  }

  async function handleDeleteAccount(account: AccountRow) {
    if (!confirm(`Delete ${account.name}? This will also delete its transactions.`)) return;
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
    await dispatch("delete_account", { id: account.id }).promise;
    await loadAccounts();
  }

  function formatBalance(balance: number | null): string {
    if (balance === null) return "—";
    return fmt().formatCents(balance);
  }

  // Separate on-budget and off-budget accounts
  const onBudgetAccounts = createMemo(() => accounts().filter((a) => !a.offbudget && !a.closed));
  const offBudgetAccounts = createMemo(() => accounts().filter((a) => a.offbudget && !a.closed));
  const allClosedAccounts = createMemo(() => accounts().filter((a) => a.closed));
  const closedAccounts = createMemo(() => (hideClosed() ? [] : allClosedAccounts()));

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Accounts</h1>
        <button class="btn btn-primary btn-sm" onClick={() => setShowAddForm(true)}>
          + Add Account
        </button>
      </div>

      <Show when={hideClosed() && allClosedAccounts().length > 0}>
        <div class="section" style={{ "margin-bottom": "8px" }}>
          <p style={{ "font-size": "0.8rem", color: "var(--text-muted)" }}>
            {allClosedAccounts().length} closed account{allClosedAccounts().length !== 1 ? "s" : ""}{" "}
            hidden (configure in Settings)
          </p>
        </div>
      </Show>

      <Show when={showAddForm()}>
        <div class="modal-overlay" onClick={() => setShowAddForm(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h2>Add Account</h2>
              <button class="modal-close" onClick={() => setShowAddForm(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div class="form-group">
                <label>Name</label>
                <input
                  type="text"
                  placeholder="e.g. Checking, Savings, Credit Card"
                  value={values.name}
                  onInput={(e) => setValues("name", e.currentTarget.value)}
                  class={errors.name ? "input-error" : ""}
                />
                {errors.name && <span class="error-message">{errors.name.message}</span>}
              </div>
              <div class="form-group">
                <label>Starting Balance (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={values.balance || ""}
                  onInput={(e) => setValues("balance", e.currentTarget.value)}
                />
              </div>
              <div class="form-check">
                <input
                  type="checkbox"
                  id="off-budget"
                  checked={values.offbudget}
                  onChange={(e) => setValues("offbudget", e.currentTarget.checked)}
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

      <PageState
        loading={loading()}
        error={error()}
        onRetry={loadAccounts}
        loadingMessage="Loading accounts..."
      >
        <Show
          when={
            onBudgetAccounts().length > 0 ||
            offBudgetAccounts().length > 0 ||
            closedAccounts().length > 0
          }
          fallback={<div class="empty-state">No accounts yet. Create one above.</div>}
        >
          <RenderAccountGroup
            title="On Budget"
            accounts={onBudgetAccounts()}
            navigate={navigate}
            formatBalance={formatBalance}
            onDelete={handleDeleteAccount}
            blurClass={privacyBlur().blurClass()}
          />
          <RenderAccountGroup
            title="Off Budget"
            accounts={offBudgetAccounts()}
            navigate={navigate}
            formatBalance={formatBalance}
            onDelete={handleDeleteAccount}
            blurClass={privacyBlur().blurClass()}
          />
          <RenderAccountGroup
            title="Closed"
            accounts={closedAccounts()}
            navigate={navigate}
            formatBalance={formatBalance}
            onDelete={handleDeleteAccount}
            blurClass={privacyBlur().blurClass()}
          />
        </Show>
      </PageState>
    </div>
  );
}

function RenderAccountGroup(props: {
  title: string;
  accounts: AccountRow[];
  navigate: (path: string) => void;
  formatBalance: (b: number | null) => string;
  onDelete: (account: AccountRow) => void;
  blurClass?: string;
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
                <div class={`account-balance ${props.blurClass ?? ""}`}>
                  {props.formatBalance(account.balanceCurrent)}
                </div>
                <button
                  class="btn btn-icon btn-ghost btn-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDelete(account);
                  }}
                  title="Delete account"
                >
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
