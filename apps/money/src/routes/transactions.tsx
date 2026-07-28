import { createSignal, createEffect, Show } from "solid-js";
import TransactionFilters from "../components/TransactionFilters";
import TransactionTable from "../components/TransactionTable";
import { PageState } from "../components/PageState";
import AddTransactionModal from "../components/AddTransactionModal";
import { dispatch } from "../lib/pending-ops";
import { api } from "../lib/api";
import type { TransactionPatch, TransactionRow } from "../components/TransactionTable";
import type { Condition } from "../components/TransactionFilters";
import type {
  AccountsResponse,
  CategoriesResponse,
  TagsResponse,
  TransactionsResponse,
} from "../domain/schemas-client";

type CategoryRow = Pick<CategoriesResponse["categories"][number], "id" | "name"> & {
  groupName: string | null;
};
type AccountRow = Pick<AccountsResponse["accounts"][number], "id" | "name" | "closed">;
type TagRow = Pick<TagsResponse["tags"][number], "id" | "name" | "color">;
type ApiTransactionRow = TransactionsResponse["transactions"][number];

function toTransactionRow(tx: ApiTransactionRow): TransactionRow {
  return {
    id: tx.id,
    accountId: tx.accountId,
    accountName: tx.accountName ?? undefined,
    date: tx.date,
    amount: tx.amount,
    payee: tx.payee,
    categoryId: tx.categoryId,
    categoryName: tx.categoryName ?? null,
    notes: tx.notes,
    cleared: tx.cleared,
    reconciled: tx.reconciled,
    isParent: tx.isParent,
    isChild: tx.isChild,
    parentId: tx.parentId,
    scheduleId: tx.scheduleId,
    scheduleName: tx.scheduleName ?? null,
  };
}

export default function AllTransactionsPage() {
  const [transactions, setTransactions] = createSignal<TransactionRow[]>([]);
  const [categories, setCategories] = createSignal<CategoryRow[]>([]);
  const [tagList, setTagList] = createSignal<TagRow[]>([]);
  const [txTags, setTxTags] = createSignal<
    Record<string, { id: string; name: string; color: string | null }[]>
  >({});
  const [accounts, setAccounts] = createSignal<AccountRow[]>([]);
  const [showAddTx, setShowAddTx] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const [filterId, setFilterId] = createSignal<string | null>(null);
  const [filterConditions, setFilterConditions] = createSignal<Condition[]>([]);
  const [filterConditionsOp, setFilterConditionsOp] = createSignal<"and" | "or">("and");

  function handleFilterChange(
    conditions: Condition[],
    conditionsOp: "and" | "or",
    fId: string | null,
  ) {
    setFilterConditions(conditions);
    setFilterConditionsOp(conditionsOp);
    setFilterId(fId);
    setLoading(true);
  }

  createEffect(() => {
    filterId();
    filterConditions();
    filterConditionsOp();
    void loadData();
  });

  createEffect(() => {
    void loadCategories();
    void loadTags();
    void loadAccounts();
  });

  async function loadData() {
    setError(null);
    try {
      const fId = filterId();
      const conditions = filterConditions();
      const data = await api.transactions(
        fId
          ? { filterId: fId }
          : conditions.length > 0
            ? { conditions, conditionsOp: filterConditionsOp() }
            : undefined,
      );
      setTransactions(data.transactions.map(toTransactionRow));
      const map: Record<string, { id: string; name: string; color: string | null }[]> = {};
      for (const tt of data.transactionTags ?? []) {
        if (!map[tt.transactionId]) map[tt.transactionId] = [];
        map[tt.transactionId].push({
          id: tt.tagId,
          name: tt.tagName,
          color: tt.tagColor,
        });
      }
      setTxTags(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const data = await api.categories();
      setCategories(
        data.categories.map((c) => ({ id: c.id, name: c.name, groupName: c.group_name ?? null })),
      );
    } catch {
      console.warn("[transactions] failed to load categories");
    }
  }

  async function loadTags() {
    try {
      const data = await api.tags();
      setTagList([...data.tags]);
    } catch {
      console.warn("[transactions] failed to load tags");
    }
  }

  async function loadAccounts() {
    try {
      const data = await api.accounts();
      setAccounts(
        data.accounts.map((account) => ({
          id: account.id,
          name: account.name,
          closed: account.closed,
        })),
      );
    } catch {
      console.warn("[transactions] failed to load accounts");
    }
  }

  function patchTransaction(id: string, patch: TransactionPatch) {
    setTransactions((prev) => prev.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx)));
  }

  function removeTransaction(id: string) {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  }

  function restoreTransaction(tx: TransactionRow) {
    setTransactions((prev) => (prev.some((item) => item.id === tx.id) ? prev : [tx, ...prev]));
  }

  function accountNames(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const account of accounts()) {
      map[account.id] = account.name;
    }
    return map;
  }

  function addTransactionTag(
    txId: string,
    tag: { id: string; name: string; color: string | null },
  ) {
    setTxTags((prev) => {
      const tags = prev[txId] ?? [];
      if (tags.some((item) => item.id === tag.id)) return prev;
      return { ...prev, [txId]: [...tags, tag] };
    });
  }

  function removeTransactionTag(txId: string, tagId: string) {
    setTxTags((prev) => ({
      ...prev,
      [txId]: (prev[txId] ?? []).filter((tag) => tag.id !== tagId),
    }));
  }

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">All Transactions</h1>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onClick={() => setShowAddTx(true)}>
            + Add Transaction
          </button>
        </div>
      </div>

      <Show when={showAddTx()}>
        <AddTransactionModal
          accounts={accounts()}
          categories={categories()}
          onClose={() => setShowAddTx(false)}
          onCreated={loadData}
        />
      </Show>

      <TransactionFilters
        activeConditions={filterConditions()}
        activeConditionsOp={filterConditionsOp()}
        onConditionsChange={handleFilterChange}
      />

      <PageState
        loading={loading()}
        error={error()}
        onRetry={loadData}
        loadingMessage="Loading transactions..."
      >
        <Show
          when={transactions().length > 0}
          fallback={<div class="empty-state">No transactions found.</div>}
        >
          <TransactionTable
            transactions={transactions()}
            categories={categories()}
            txTags={txTags()}
            tagList={tagList()}
            showAccount
            accountNames={accountNames()}
            onReload={loadData}
            onTransactionPatch={patchTransaction}
            onTransactionRemove={removeTransaction}
            onTransactionRestore={restoreTransaction}
            onTagAdd={addTransactionTag}
            onTagRemove={removeTransactionTag}
            onCreateSchedule={(tx) => {
              dispatch(
                "create_schedule",
                {
                  schedule: {
                    name: tx.payee ?? "From transaction",
                    amount: tx.amount,
                    recurrenceRules: JSON.stringify({ type: "monthly" }),
                    startDate: new Date().toISOString().slice(0, 10),
                  },
                },
                {
                  undoInfo: {
                    label: "Create schedule from transaction",
                    inverse: (data) => ({
                      commandType: "delete_schedule",
                      payload: { id: data.id as string },
                    }),
                  },
                },
              );
            }}
          />
        </Show>
      </PageState>
    </div>
  );
}
