import { createSignal, createMemo, createEffect, For, Show, onCleanup } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { dispatch } from "../lib/pending-ops";
import { api } from "../lib/api";
import { useCurrency } from "../lib/currency";
import { usePrivacyMode } from "../lib/privacy";
import { useDateFormat } from "../lib/date-format";

export interface TransactionRow {
  id: string;
  accountId: string;
  accountName?: string;
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
  scheduleId?: string | null;
  scheduleName?: string | null;
  tags?: { id: string; name: string; color: string | null }[];
}

interface TagInfo {
  id: string;
  name: string;
  color: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  groupName: string | null;
}

interface SplitChild {
  tempId: string;
  categoryId: string;
  amount: string;
  notes: string;
}

type TxField = "date" | "payee" | "amount" | "category" | "notes";

interface TransactionTableProps {
  transactions: TransactionRow[];
  categories: CategoryRow[];
  txTags: Record<string, TagInfo[]>;
  tagList: TagInfo[];
  showBalance?: boolean;
  showAccount?: boolean;
  accountNames?: Record<string, string>;
  onCreateSchedule?: (tx: TransactionRow) => void;
}

export default function TransactionTable(props: TransactionTableProps) {
  const navigate = useNavigate();
  const fmt = useCurrency();
  const privacyBlur = usePrivacyMode();
  const df = useDateFormat();

  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editingField, setEditingField] = createSignal<TxField | null>(null);

  const [splitParentId, setSplitParentId] = createSignal<string | null>(null);
  const [splitChildren, setSplitChildren] = createSignal<SplitChild[]>([]);
  const [showTagPicker, setShowTagPicker] = createSignal<string | null>(null);

  createEffect(() => {
    if (showTagPicker()) {
      const handler = () => setShowTagPicker(null);
      document.addEventListener("click", handler);
      onCleanup(() => document.removeEventListener("click", handler));
    }
  });

  const payeeNames = createMemo(() => {
    const names = new Set<string>();
    for (const tx of props.transactions) {
      if (tx.payee) names.add(tx.payee);
    }
    return [...names].sort();
  });

  const transactionsWithBalance = createMemo(() => {
    if (!props.showBalance) return props.transactions;
    const txs = [...props.transactions].sort(
      (a, _b) => new Date(a.date).getTime() - new Date(a.date).getTime(),
    );
    const result: Array<TransactionRow & { balance: number }> = [];
    let balance = 0;
    for (const tx of txs) {
      balance += tx.amount;
      result.push({ ...tx, balance });
    }
    return result.reverse();
  });

  function startEdit(txId: string, field: TxField) {
    setEditingId(txId);
    setEditingField(field);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingField(null);
  }

  function undoUpdateTx(
    tx: TransactionRow,
    fields: Record<string, unknown>,
  ): { commandType: string; payload: unknown } {
    const oldFields: Record<string, unknown> = {};
    if ("amount" in fields) oldFields.amount = tx.amount;
    if ("date" in fields) oldFields.date = tx.date;
    if ("payee" in fields) oldFields.payee = tx.payee ?? undefined;
    if ("notes" in fields) oldFields.notes = tx.notes ?? undefined;
    if ("categoryId" in fields) oldFields.categoryId = tx.categoryId;
    if ("cleared" in fields) oldFields.cleared = tx.cleared;
    if ("reconciled" in fields) oldFields.reconciled = tx.reconciled;
    return { commandType: "update_transaction", payload: { id: tx.id, fields: oldFields } };
  }

  function saveEdit(tx: TransactionRow, field: TxField, value: string) {
    if (field === "amount") {
      const cents = fmt().parseInput(value);
      if (cents !== tx.amount) {
        dispatch(
          "update_transaction",
          { id: tx.id, fields: { amount: cents } },
          {
            undoInfo: { label: "Update amount", inverse: undoUpdateTx(tx, { amount: cents }) },
          },
        );
      }
    } else if (field === "date") {
      if (value !== tx.date) {
        dispatch(
          "update_transaction",
          { id: tx.id, fields: { date: value } },
          {
            undoInfo: { label: "Update date", inverse: undoUpdateTx(tx, { date: value }) },
          },
        );
      }
    } else if (field === "payee") {
      if (value !== (tx.payee ?? "")) {
        dispatch(
          "update_transaction",
          { id: tx.id, fields: { payee: value || undefined } },
          {
            undoInfo: { label: "Update payee", inverse: undoUpdateTx(tx, { payee: value }) },
          },
        );
        if (value.trim() && !tx.categoryId) {
          void fetchCategorySuggestion(tx, value.trim());
        }
      }
    } else if (field === "notes") {
      if (value !== (tx.notes ?? "")) {
        dispatch(
          "update_transaction",
          { id: tx.id, fields: { notes: value || undefined } },
          {
            undoInfo: { label: "Update notes", inverse: undoUpdateTx(tx, { notes: value }) },
          },
        );
      }
    } else if (field === "category") {
      const catId = value || null;
      if (catId !== tx.categoryId) {
        dispatch(
          "update_transaction",
          { id: tx.id, fields: { categoryId: catId } },
          {
            undoInfo: {
              label: "Update category",
              inverse: undoUpdateTx(tx, { categoryId: catId }),
            },
          },
        );
      }
    }
    cancelEdit();
  }

  async function fetchCategorySuggestion(tx: TransactionRow, payee: string) {
    try {
      const data = await api.payeeSuggestions(payee);
      if (data.suggestions.length > 0) {
        dispatch(
          "update_transaction",
          {
            id: tx.id,
            fields: { categoryId: data.suggestions[0].category_id },
          },
          {
            undoInfo: {
              label: "Set category from payee",
              inverse: undoUpdateTx(tx, { categoryId: data.suggestions[0].category_id }),
            },
          },
        );
      }
    } catch {
      console.warn("[TransactionTable] failed to fetch category suggestion");
    }
  }

  function handleDelete(tx: TransactionRow) {
    if (!confirm("Delete this transaction?")) return;
    dispatch(
      "delete_transaction",
      { id: tx.id },
      {
        undoInfo: {
          label: "Delete transaction",
          inverse: {
            commandType: "create_transaction",
            payload: {
              row: {
                accountId: tx.accountId,
                date: tx.date,
                amount: tx.amount,
                payee: tx.payee ?? undefined,
                notes: tx.notes ?? undefined,
                categoryId: tx.categoryId ?? null,
                cleared: tx.cleared,
              },
            },
          },
        },
      },
    );
  }

  function toggleCleared(tx: TransactionRow) {
    dispatch(
      "update_transaction",
      { id: tx.id, fields: { cleared: !tx.cleared } },
      {
        undoInfo: { label: "Toggle cleared", inverse: undoUpdateTx(tx, { cleared: !tx.cleared }) },
      },
    );
  }

  function toggleReconciled(tx: TransactionRow) {
    dispatch(
      "update_transaction",
      { id: tx.id, fields: { reconciled: !tx.reconciled } },
      {
        undoInfo: {
          label: "Toggle reconciled",
          inverse: undoUpdateTx(tx, { reconciled: !tx.reconciled }),
        },
      },
    );
  }

  function initSplit(tx: TransactionRow) {
    setSplitParentId(tx.id);
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

    const parent = props.transactions.find((t) => t.id === parentId);
    if (!parent) return;

    const children = splitChildren()
      .map((c) => {
        const cents = fmt().parseInput(c.amount);
        if (cents === 0) return null;
        return {
          accountId: parent.accountId,
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

  function handleAddTag(txId: string, tagId: string) {
    dispatch("add_transaction_tag", { transactionId: txId, tagId });
    setShowTagPicker(null);
  }

  function handleRemoveTag(txId: string, tagId: string) {
    dispatch("remove_transaction_tag", { transactionId: txId, tagId });
  }

  function formatCents(cents: number): string {
    return fmt().formatCents(cents);
  }

  return (
    <div>
      <datalist id="tx-payee-list">
        <For each={payeeNames()}>{(name) => <option value={name} />}</For>
      </datalist>

      <div class="transaction-table">
        <div class="tx-table-header" classList={{ "show-account": !!props.showAccount }}>
          <span class="tx-col-cr">C/R</span>
          <span class="tx-col-date">Date</span>
          <Show when={props.showAccount}>
            <span class="tx-col-account">Account</span>
          </Show>
          <span class="tx-col-payee">Payee</span>
          <span class="tx-col-category">Category</span>
          <span class="tx-col-tags">Tags</span>
          <span class="tx-col-amount">Amount ({fmt().symbol})</span>
          <Show when={props.showBalance}>
            <span class="tx-col-balance">Balance</span>
          </Show>
          <span class="tx-col-actions" />
        </div>
        <For each={transactionsWithBalance()}>
          {(tx) => {
            const isEditing = (field: TxField) => editingId() === tx.id && editingField() === field;
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
                    "show-account": !!props.showAccount,
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
                      <span onClick={() => startEdit(tx.id, "date")}>
                        {df().formatDate(tx.date)}
                      </span>
                    )}
                  </span>

                  <Show when={props.showAccount}>
                    <span class="tx-col-account">{props.accountNames?.[tx.accountId] ?? "—"}</span>
                  </Show>

                  <span class="tx-col-payee">
                    <Show when={tx.scheduleId}>
                      <span
                        class="schedule-badge"
                        title={`From schedule: ${tx.scheduleName ?? "Unknown"}`}
                        style={{ cursor: "pointer", "margin-right": "4px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/schedules/${tx.scheduleId}`);
                        }}
                      >
                        ↻
                      </span>
                    </Show>
                    {isEditing("payee") ? (
                      <input
                        type="text"
                        list="tx-payee-list"
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
                      <span classList={{ "tx-schedule-linked": !!tx.scheduleId }}>
                        <span onClick={() => startEdit(tx.id, "payee")}>
                          {tx.isParent ? <em>Split</em> : (tx.payee ?? "—")}
                        </span>
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
                            saveEdit(tx, "category", (e.currentTarget as HTMLSelectElement).value);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        autofocus
                      >
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
                    ) : (
                      <span
                        classList={{ "tx-split-label": tx.isParent }}
                        onClick={() => startEdit(tx.id, "category")}
                      >
                        {tx.isParent ? "Split" : (tx.categoryName ?? "Uncategorized")}
                      </span>
                    )}
                  </span>

                  <span class="tx-col-tags">
                    <div
                      style={{
                        display: "flex",
                        "flex-wrap": "wrap",
                        gap: "2px",
                        "align-items": "center",
                      }}
                    >
                      <For each={props.txTags[tx.id] ?? []}>
                        {(tag) => (
                          <span
                            class="tag-chip-sm"
                            style={{
                              background: tag.color ?? "#4f46e5",
                              color: "#fff",
                              cursor: "pointer",
                            }}
                            onClick={() => handleRemoveTag(tx.id, tag.id)}
                            title={`Remove tag "${tag.name}"`}
                          >
                            {tag.name} ✕
                          </span>
                        )}
                      </For>
                      <button
                        class="btn btn-icon btn-xs btn-ghost"
                        style={{ "font-size": "0.65rem", padding: "1px 4px" }}
                        onClick={() => setShowTagPicker(showTagPicker() === tx.id ? null : tx.id)}
                        title="Add tag"
                      >
                        +
                      </button>
                    </div>
                    <Show when={showTagPicker() === tx.id}>
                      <div class="tag-picker-dropdown" onClick={(e) => e.stopPropagation()}>
                        <For
                          each={props.tagList.filter(
                            (t: TagInfo) =>
                              !(props.txTags[tx.id] ?? []).find((tt) => tt.id === t.id),
                          )}
                        >
                          {(tag: TagInfo) => (
                            <button
                              class="btn btn-ghost btn-xs tag-picker-option"
                              onClick={() => handleAddTag(tx.id, tag.id)}
                            >
                              <span
                                class="tag-dot-sm"
                                style={{ background: tag.color ?? "#4f46e5" }}
                              />
                              {tag.name}
                            </button>
                          )}
                        </For>
                        <Show
                          when={
                            props.tagList.filter(
                              (t: TagInfo) =>
                                !(props.txTags[tx.id] ?? []).find((tt) => tt.id === t.id),
                            ).length === 0
                          }
                        >
                          <span
                            style={{
                              color: "var(--text-muted)",
                              "font-size": "0.75rem",
                              padding: "4px",
                            }}
                          >
                            No more tags
                          </span>
                        </Show>
                      </div>
                    </Show>
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
                      <span
                        class={privacyBlur().blurClass()}
                        onClick={() => startEdit(tx.id, "amount")}
                      >
                        {formatCents(tx.amount ?? 0)}
                      </span>
                    )}
                  </span>

                  <Show when={props.showBalance}>
                    <span class={`tx-col-balance ${privacyBlur().blurClass()}`}>
                      {formatCents((tx as TransactionRow & { balance: number }).balance)}
                    </span>
                  </Show>

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
                      onClick={() => props.onCreateSchedule?.(tx)}
                      title="Create schedule from this transaction"
                      disabled={!!tx.isChild || !!tx.isParent}
                    >
                      📅
                    </button>
                    <button class="btn btn-icon btn-ghost btn-xs" onClick={() => handleDelete(tx)}>
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
                                updateSplitChild(child.tempId, "categoryId", e.currentTarget.value)
                              }
                            >
                              <option value="">Category</option>
                              <For each={props.categories}>
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
    </div>
  );
}
