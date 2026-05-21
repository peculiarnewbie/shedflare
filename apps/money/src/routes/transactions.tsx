import { createSignal, createEffect, Show, onCleanup } from "solid-js";
import { transactionsCollection, categoriesCollection } from "../lib/collections";
import TransactionFilters from "../components/TransactionFilters";
import TransactionTable from "../components/TransactionTable";
import { PageState } from "../components/PageState";
import type { TransactionRow } from "../components/TransactionTable";
import type { Condition } from "../components/TransactionFilters";

export default function AllTransactionsPage() {
  const [transactions, setTransactions] = createSignal<TransactionRow[]>([]);
  const [categories, setCategories] = createSignal<any[]>([]);
  const [tagList, setTagList] = createSignal<any[]>([]);
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
    void loadData();
  }

  createEffect(() => {
    void loadData();
    void loadCategories();
    void loadTags();
    void loadAccounts();
  });

  createEffect(() => {
    const unsub1 = transactionsCollection.subscribeChanges(() => {
      void loadData();
    });
    const unsub2 = categoriesCollection.subscribeChanges(() => {
      void loadCategories();
    });
    onCleanup(() => {
      unsub1.unsubscribe();
      unsub2.unsubscribe();
    });
  });

  async function loadData() {
    setError(null);
    try {
      const fId = filterId();
      const filterParam = fId ? `?filter=${encodeURIComponent(fId)}` : "";
      const txRes = await fetch(`/api/transactions${filterParam}`);
      if (txRes.ok) {
        const data = (await txRes.json()) as any;
        setTransactions(data.transactions ?? []);
      } else {
        setError(`Failed to load (${txRes.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions");
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

  async function loadAccounts() {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = (await res.json()) as any;
        const map: Record<string, string> = {};
        for (const a of data.accounts ?? []) {
          map[a.id] = a.name;
        }
        setAccounts(map);
      }
    } catch {
      // ignore
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
          />
        </Show>
      </PageState>
    </div>
  );
}
