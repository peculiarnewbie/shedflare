import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { dispatch, requireCommandId } from "../lib/pending-ops";
import { api } from "../lib/api";
import { useCurrency } from "../lib/currency";
import { emitMoneyDataChanged } from "../lib/data-events";
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
  onCreated?: () => void | Promise<void>;
}

export default function AddTransactionModal(props: AddTransactionModalProps) {
  const fmt = useCurrency();
  const rememberedAccountId = globalThis.localStorage?.getItem("money.lastAccountId") ?? "";
  const [accountId, setAccountId] = createSignal(
    props.initialAccountId ??
      (props.accounts.some((account) => account.id === rememberedAccountId && !account.closed)
        ? rememberedAccountId
        : ""),
  );
  const [kind, setKind] = createSignal<"expense" | "income">("expense");
  const [txDate, setTxDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [txPayee, setTxPayee] = createSignal("");
  const [txAmount, setTxAmount] = createSignal("");
  const [txCategory, setTxCategory] = createSignal("");
  const [txNotes, setTxNotes] = createSignal("");
  const [autoCategory, setAutoCategory] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let payeeInput: HTMLInputElement | undefined;
  let accountSelect: HTMLSelectElement | undefined;
  let primarySubmitButton: HTMLButtonElement | undefined;
  let payeeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    if (accountId()) payeeInput?.focus();
    else accountSelect?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving()) props.onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  });

  onCleanup(() => {
    if (payeeDebounceTimer) clearTimeout(payeeDebounceTimer);
  });

  createEffect(() => {
    const autoCat = autoCategory();
    if (autoCat && !txCategory()) setTxCategory(autoCat);
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
        setAutoCategory(null);
      }
    }, 300);
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setError(null);
    const shouldAddAnother =
      event.submitter instanceof HTMLButtonElement && event.submitter.value === "add-another";

    const selectedAccountId = accountId();
    const inputCents = Math.abs(fmt().parseInput(txAmount()));
    if (!selectedAccountId) {
      setError("Choose an account first.");
      accountSelect?.focus();
      return;
    }
    if (inputCents === 0) {
      setError("Enter a non-zero amount.");
      return;
    }

    const amount = kind() === "expense" ? -inputCents : inputCents;
    setSaving(true);
    const { promise } = dispatch(
      "create_transaction",
      {
        row: {
          accountId: selectedAccountId,
          date: txDate(),
          amount,
          payee: txPayee() || undefined,
          notes: txNotes() || undefined,
          categoryId: txCategory() || null,
          cleared: true,
        },
      },
      {
        undoInfo: {
          label: `Add ${kind()}`,
          inverse: (data) => ({
            commandType: "delete_transaction",
            payload: { id: requireCommandId(data) },
          }),
        },
      },
    );

    try {
      await promise;
      globalThis.localStorage?.setItem("money.lastAccountId", selectedAccountId);
      emitMoneyDataChanged();
      await props.onCreated?.();
      if (shouldAddAnother) {
        setTxPayee("");
        setTxAmount("");
        setTxCategory("");
        setTxNotes("");
        setAutoCategory(null);
        payeeInput?.focus();
      } else {
        props.onClose();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to add transaction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="modal-overlay" onClick={() => !saving() && props.onClose()}>
      <div
        class="modal modal--wide transaction-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-transaction-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div class="modal-header">
          <div>
            <h2 id="add-transaction-title">Add Transaction</h2>
            <p class="modal-subtitle">Record money in or out without leaving this page.</p>
          </div>
          <button
            type="button"
            class="modal-close"
            onClick={props.onClose}
            disabled={saving()}
            aria-label="Close add transaction"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
              event.preventDefault();
              event.currentTarget.requestSubmit(primarySubmitButton);
            }
          }}
        >
          <div class="transaction-kind" role="group" aria-label="Transaction type">
            <button
              type="button"
              class="transaction-kind-option"
              classList={{ active: kind() === "expense" }}
              aria-pressed={kind() === "expense"}
              onClick={() => setKind("expense")}
            >
              Expense
            </button>
            <button
              type="button"
              class="transaction-kind-option"
              classList={{ active: kind() === "income" }}
              aria-pressed={kind() === "income"}
              onClick={() => setKind("income")}
            >
              Income
            </button>
          </div>

          <div class="form-row">
            <Show when={!props.initialAccountId}>
              <div class="form-group" style={{ flex: "1 1 220px" }}>
                <label for="transaction-account">Account</label>
                <select
                  id="transaction-account"
                  ref={(element) => {
                    accountSelect = element;
                  }}
                  value={accountId()}
                  onChange={(event) => setAccountId(event.currentTarget.value)}
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
              <label for="transaction-date">Date</label>
              <input
                id="transaction-date"
                type="date"
                value={txDate()}
                onInput={(event) => setTxDate(event.currentTarget.value)}
                required
              />
            </div>
            <div class="form-group" style={{ flex: "0 0 170px" }}>
              <label for="transaction-amount">Amount</label>
              <input
                id="transaction-amount"
                type="number"
                min="0"
                step={fmt().code === "IDR" ? "1" : "0.01"}
                placeholder="0.00"
                value={txAmount()}
                onInput={(event) => setTxAmount(event.currentTarget.value)}
                required
              />
              <span class="field-hint">Enter a positive amount.</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" style={{ flex: "1 1 240px" }}>
              <label for="transaction-payee">Payee</label>
              <input
                id="transaction-payee"
                ref={(element) => {
                  payeeInput = element;
                }}
                type="text"
                list="tx-payee-list"
                placeholder="e.g. Grocery Store"
                value={txPayee()}
                onInput={(event) => handlePayeeInput(event.currentTarget.value)}
              />
            </div>
            <div class="form-group" style={{ flex: "1 1 220px" }}>
              <label for="transaction-category">Category</label>
              <select
                id="transaction-category"
                value={txCategory()}
                onChange={(event) => setTxCategory(event.currentTarget.value)}
              >
                <option value="">Uncategorized</option>
                <For each={props.categories}>
                  {(category) => (
                    <option value={category.id}>
                      {category.groupName ? `${category.groupName}: ` : ""}
                      {category.name}
                    </option>
                  )}
                </For>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="transaction-notes">Notes</label>
            <input
              id="transaction-notes"
              type="text"
              placeholder="Optional notes"
              value={txNotes()}
              onInput={(event) => setTxNotes(event.currentTarget.value)}
            />
          </div>

          <Show when={error()}>{(message) => <div class="form-error">{message()}</div>}</Show>

          <div class="form-actions composer-actions">
            <button type="button" class="btn btn-ghost" onClick={props.onClose} disabled={saving()}>
              Cancel
            </button>
            <button type="submit" class="btn btn-secondary" disabled={saving()} value="add-another">
              Save &amp; add another
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              disabled={saving()}
              value="close"
              ref={(element) => {
                primarySubmitButton = element;
              }}
            >
              {saving() ? "Saving..." : `Add ${kind()}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
