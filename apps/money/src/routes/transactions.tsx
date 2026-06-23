import { createSignal, createEffect, Show } from "solid-js";
import TransactionFilters from "../components/TransactionFilters";
import TransactionTable from "../components/TransactionTable";
import { PageState } from "../components/PageState";
import { dispatch } from "../lib/pending-ops";
import { api } from "../lib/api";
import type { TransactionRow } from "../components/TransactionTable";
import type { Condition } from "../components/TransactionFilters";
import type {
  CategoriesResponse,
  TagsResponse,
  TransactionsResponse,
} from "../domain/schemas-client";

type CategoryRow = Pick<CategoriesResponse["categories"][number], "id" | "name"> & {
  groupName: string | null;
};
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
  const [txTags, _setTxTags] = createSignal<
    Record<string, { id: string; name: string; color: string | null }[]>
  >({});
  const [accounts, setAccounts] = createSignal<Record<string, string>>({});
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const [filterId, setFilterId] = createSignal<string | null>(null);
  const [filterConditions, setFilterConditions] = createSignal<Condition[]>([]);
  const [_filterConditionsOp, setFilterConditionsOp] = createSignal<"and" | "or">("and");

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
    void loadData();
    void loadCategories();
    void loadTags();
    void loadAccounts();
  });

  async function loadData() {
    setError(null);
    try {
      const fId = filterId();
      const data = await api.transactions(fId ?? undefined);
      setTransactions(data.transactions.map(toTransactionRow));
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
      const map: Record<string, string> = {};
      for (const a of data.accounts) {
        map[a.id] = a.name;
      }
      setAccounts(map);
    } catch {
      console.warn("[transactions] failed to load accounts");
    }
  }

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">All Transactions</h1>
      </div>

      <TransactionFilters
        activeConditions={filterConditions()}
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
            accountNames={accounts()}
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
