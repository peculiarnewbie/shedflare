import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { dispatch } from "../lib/pending-ops";
import { api } from "../lib/api";
import { useCurrency } from "../lib/currency";
import type { AccountsResponse, CategoriesResponse } from "../domain/schemas-client";

type AccountRow = Pick<AccountsResponse["accounts"][number], "id" | "name" | "closed">;
type CategoryRow = Pick<CategoriesResponse["categories"][number], "id" | "name"> & {
  groupName: string | null;
};

interface AddTransactionModalProps {
  accounts: AccountRow[];
  categories: CategoryRow[];
  initialAccountId?: string;
  onClose: () => void;
  onCreated?: () => void;
}

export default function AddTransactionModal(props: AddTransactionModalProps) {
  const fmt = useCurrency();
  const [accountId, setAccountId] = createSignal(props.initialAccountId ?? "");
  const [txDate, setTxDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [txPayee, setTxPayee] = createSignal("");
  const [txAmount, setTxAmount] = createSignal("");
  const [txCategory, setTxCategory] = createSignal("");
  const [txNotes, setTxNotes] = createSignal("");
  const [autoCategory, setAutoCategory] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let payeeInput: HTMLInputElement | undefined;
  let payeeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => payeeInput?.focus());

  onCleanup(() => {
    if (payeeDebounceTimer) clearTimeout(payeeDebounceTimer);
  });

  createEffect(() => {
    const autoCat = autoCategory();
    if (autoCat && !txCategory()) {
      setTxCategory(autoCat);
    }
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
        const data = await api.payeeSuggestions(value.trim());
        setAutoCategory(data.suggestions[0]?.category_id ?? null);
      } catch {
        console.warn("[AddTransactionModal] failed to fetch category suggestion");
        setAutoCategory(null);
      }
    }, 300);
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError(null);

    const selectedAccountId = accountId();
    const cents = fmt().parseInput(txAmount());
    if (!selectedAccountId) {
      setError("Choose an account first.");
      return;
    }
    if (cents === 0) {
      setError("Enter a non-zero amount.");
      return;
    }

    setSaving(true);
    const { promise } = dispatch(
      "create_transaction",
      {
        row: {
          accountId: selectedAccountId,
          date: txDate(),
          amount: cents,
          payee: txPayee() || undefined,
          notes: txNotes() || undefined,
          categoryId: txCategory() || null,
          cleared: true,
        },
      },
      {
        undoInfo: {
          label: "Add transaction",
          inverse: (data) => ({
            commandType: "delete_transaction",
            payload: { id: data.id as string },
          }),
        },
      },
    );

    try {
      await promise;
      props.onCreated?.();
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add transaction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div
        class="modal modal--wide"
        role="dialog"
        aria-label="Add transaction"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="modal-header">
          <h2>Add Transaction</h2>
          <button class="modal-close" onClick={props.onClose} aria-label="Close add transaction">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div class="form-row">
            <Show when={!props.initialAccountId}>
              <div class="form-group" style={{ flex: "1 1 220px" }}>
                <label>Account</label>
                <select
                  value={accountId()}
                  onChange={(e) => setAccountId(e.currentTarget.value)}
                  required
                >
                  <option value="">Choose account...</option>
                  <For each={props.accounts.filter((account) => !account.closed)}>
                    {(account) => <option value={account.id}>{account.name}</option>}
                  </For>
                </select>
              </div>
            </Show>
            <div class="form-group" style={{ flex: "0 0 150px" }}>
              <label>Date</label>
              <input
                type="date"
                value={txDate()}
                onInput={(e) => setTxDate(e.currentTarget.value)}
                required
              />
            </div>
            <div class="form-group" style={{ flex: "0 0 170px" }}>
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
            <div class="form-group" style={{ flex: "1 1 240px" }}>
              <label>Payee</label>
              <input
                ref={(el) => {
                  payeeInput = el;
                }}
                type="text"
                list="tx-payee-list"
                placeholder="e.g. Grocery Store"
                value={txPayee()}
                onInput={(e) => handlePayeeInput(e.currentTarget.value)}
              />
            </div>
            <div class="form-group" style={{ flex: "1 1 220px" }}>
              <label>Category</label>
              <select value={txCategory()} onChange={(e) => setTxCategory(e.currentTarget.value)}>
                <option value="">Uncategorized</option>
                <For each={props.categories}>
                  {(cat) => (
                    <option value={cat.id}>
                      {cat.groupName ? `${cat.groupName}: ` : ""}
                      {cat.name}
                    </option>
                  )}
                </For>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Notes</label>
            <input
              type="text"
              placeholder="Optional notes"
              value={txNotes()}
              onInput={(e) => setTxNotes(e.currentTarget.value)}
            />
          </div>

          <Show when={error()}>{(message) => <div class="form-error">{message()}</div>}</Show>

          <div class="form-actions">
            <button type="button" class="btn btn-ghost" onClick={props.onClose} disabled={saving()}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" disabled={saving()}>
              {saving() ? "Adding..." : "Add Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
