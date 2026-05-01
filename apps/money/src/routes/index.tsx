import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { convertAmount, formatAmount, formatMonthKey, MoneyProvider, useMoney } from "../context";
import type { Currency, ItemType } from "../types";

/* ── Entry Point ─────────────────────────────────── */

export default function Home() {
  return (
    <MoneyProvider>
      <MoneyShell />
    </MoneyProvider>
  );
}

/* ── Shell ───────────────────────────────────────── */

function MoneyShell() {
  const ctx = useMoney();

  return (
    <>
      <TopBar />

      <Show when={ctx.userEmail()}>
        <div class="page">
          <MonthSelector />
          <SummaryBar />
          <div class="section">
            <div class="section-header">
              <span class="section-title">Recurring</span>
              <button
                class="btn btn-sm btn-ghost"
                onClick={() => ctx.addToast("Tap + to add an item", "info")}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" style="width:12px;height:12px">
                  <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z" />
                </svg>
                Template
              </button>
            </div>
            <Show
              when={ctx.loading() && ctx.monthlyItems().length === 0}
              fallback={<MonthlyItemsList />}
            >
              <SkeletonList count={3} />
            </Show>
          </div>

          <div class="section">
            <div class="section-header">
              <span class="section-title">This Month</span>
            </div>
            <Show
              when={ctx.loading() && ctx.manualItems().length === 0}
              fallback={<ManualItemsList />}
            >
              <SkeletonList count={2} />
            </Show>
          </div>
        </div>
      </Show>

      <Show when={ctx.userEmail()}>
        <Fab />
      </Show>

      <SessionOverlays />
      <ToastContainer />
    </>
  );
}

/* ── Top Bar ─────────────────────────────────────── */

function TopBar() {
  const ctx = useMoney();

  return (
    <header class="top-bar">
      <div class="top-bar-brand">
        <span class="top-bar-dot" />
        <span class="top-bar-title">Shedflare Money</span>
      </div>
      <div class="top-bar-right">
        <Show when={ctx.userEmail()}>
          <CurrencyToggle />
          <span class="top-bar-email">{ctx.userEmail()}</span>
          <form method="post" action="/api/auth/logout">
            <button class="btn btn-sm btn-ghost">Sign out</button>
          </form>
        </Show>
      </div>
    </header>
  );
}

/* ── Currency toggle in top bar ─────────────────── */

function CurrencyToggle() {
  const ctx = useMoney();

  return (
    <div class="currency-toggle">
      <button
        classList={{ "currency-opt": true, active: ctx.displayCurrency() === "USD" }}
        onClick={() => ctx.setDisplayCurrency("USD")}
      >
        USD
      </button>
      <button
        classList={{ "currency-opt": true, active: ctx.displayCurrency() === "IDR" }}
        onClick={() => ctx.setDisplayCurrency("IDR")}
      >
        IDR
      </button>
      <Show when={ctx.exchangeRate() && ctx.displayCurrency() === "IDR"}>
        <span
          class="currency-rate"
          title={`1 USD = ${ctx.exchangeRate()?.usdToIdr.toLocaleString()} IDR`}
        >
          ~{Math.round(ctx.exchangeRate()?.usdToIdr ?? 16000).toLocaleString()}
        </span>
      </Show>
    </div>
  );
}

/* ── Month Selector ─────────────────────────────── */

function MonthSelector() {
  const ctx = useMoney();

  function prevMonth() {
    const [y, m] = ctx.currentMonth().split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    ctx.setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  function nextMonth() {
    const [y, m] = ctx.currentMonth().split("-").map(Number);
    const d = new Date(y, m, 1);
    ctx.setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const now = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <div class="month-selector">
      <button class="month-arrow" onClick={prevMonth} title="Previous month">
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
          />
        </svg>
      </button>
      <div class="month-label">
        <span>{formatMonthKey(ctx.currentMonth())}</span>
        <Show when={ctx.currentMonth() === now()}>
          <span class="month-label-sub">Current</span>
        </Show>
      </div>
      <button class="month-arrow" onClick={nextMonth} title="Next month">
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
          />
        </svg>
      </button>
    </div>
  );
}

/* ── Summary Bar ──────────────────────────────────── */

function SummaryBar() {
  const ctx = useMoney();
  const displayCurrency = () => ctx.displayCurrency();
  const rate = () => ctx.exchangeRate()?.usdToIdr ?? 16000;

  const summary = createMemo(() => {
    const s = ctx.summary();
    if (!s) return null;
    const toDisplay = (amount: number, currency: Currency) => {
      if (displayCurrency() === currency) return formatAmount(amount, currency);
      if (currency === "USD") {
        const converted = convertAmount(amount, "USD", "IDR", rate());
        return formatAmount(converted, "IDR");
      }
      const converted = convertAmount(amount, "IDR", "USD", rate());
      return formatAmount(converted, "USD");
    };
    return {
      income: toDisplay(s.income, "USD"),
      expense: toDisplay(s.expense, "USD"),
      balance: toDisplay(s.balance, "USD"),
      incomeCount: s.incomeCount,
      expenseCount: s.expenseCount,
      rawBalance: s.balance,
    };
  });

  return (
    <div class="summary-bar">
      <div class="summary-stat income">
        <div class="summary-stat-label">Income</div>
        <div class="summary-stat-value income">{summary()?.income ?? "—"}</div>
        <div class="summary-stat-count">{summary()?.incomeCount ?? 0} items</div>
      </div>
      <div class="summary-stat expense">
        <div class="summary-stat-label">Expenses</div>
        <div class="summary-stat-value expense">{summary()?.expense ?? "—"}</div>
        <div class="summary-stat-count">{summary()?.expenseCount ?? 0} items</div>
      </div>
      <div
        class="summary-stat balance"
        classList={{
          positive: (summary()?.rawBalance ?? 0) >= 0,
          negative: (summary()?.rawBalance ?? 0) < 0,
        }}
      >
        <div class="summary-stat-label">Balance</div>
        <div
          class="summary-stat-value"
          classList={{
            positive: (summary()?.rawBalance ?? 0) >= 0,
            negative: (summary()?.rawBalance ?? 0) < 0,
          }}
        >
          {summary()?.balance ?? "—"}
        </div>
        <div class="summary-stat-count">
          {(summary()?.rawBalance ?? 0) >= 0 ? "Surplus" : "Deficit"}
        </div>
      </div>
    </div>
  );
}

/* ── Recurring Monthly Items List ────────────────── */

function MonthlyItemsList() {
  const ctx = useMoney();

  return (
    <Show
      when={ctx.monthlyItems().length > 0}
      fallback={
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2v20M2 12h20" stroke-linecap="round" />
              <path d="M8 8l8 8M8 16l8-8" stroke-linecap="round" />
            </svg>
          }
          text="No recurring items"
          sub="Tap + to add an income or expense template"
        />
      }
    >
      <div class="item-list">
        <For each={ctx.monthlyItems()}>
          {(item, i) => (
            <div class="item-row" classList={{ [`item-row-reveal-${Math.min(i() + 1, 6)}`]: true }}>
              <button
                class="toggle-switch"
                classList={{ active: item.active }}
                onClick={() => ctx.toggleMonthlyItem(item.id, !item.active)}
                title={item.active ? "Disable for this month" : "Enable for this month"}
              >
                <span class="toggle-thumb" />
              </button>
              <div
                class="item-indicator"
                classList={{ income: item.type === "income", expense: item.type === "expense" }}
              />
              <div class="item-info">
                <div class="item-name">{item.name}</div>
                <div class="item-meta">
                  <span class="item-category">{item.category}</span>
                  <Show when={item.note}>
                    <span class="item-note">{item.note}</span>
                  </Show>
                </div>
              </div>
              <AmountDisplay amount={item.amount} currency={item.currency} type={item.type} />
              <div class="item-actions show">
                <button
                  class="btn btn-icon btn-ghost"
                  onClick={() => ctx.deleteMonthlyItem(item.id)}
                  title="Delete"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
                    <path
                      fill-rule="evenodd"
                      d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

/* ── Manual Items List ───────────────────────────── */

function ManualItemsList() {
  const ctx = useMoney();

  return (
    <Show
      when={ctx.manualItems().length > 0}
      fallback={
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M8 2v4M16 2v4M3 10h18" stroke-linecap="round" />
            </svg>
          }
          text="No entries for this month"
          sub="Add one-off income or expenses here"
        />
      }
    >
      <div class="item-list">
        <For each={ctx.manualItems()}>
          {(item, i) => (
            <div class="item-row" classList={{ [`item-row-reveal-${Math.min(i() + 1, 6)}`]: true }}>
              <div
                class="item-indicator"
                classList={{ income: item.type === "income", expense: item.type === "expense" }}
              />
              <div class="item-info">
                <div class="item-name">{item.name}</div>
                <div class="item-meta">
                  <span class="item-category">{item.category}</span>
                  <span class="item-note">{item.date.slice(5)}</span>
                  <Show when={item.note}>
                    <span class="item-note">· {item.note}</span>
                  </Show>
                </div>
              </div>
              <AmountDisplay amount={item.amount} currency={item.currency} type={item.type} />
              <div class="item-actions show">
                <button
                  class="btn btn-icon btn-ghost"
                  onClick={() => ctx.deleteManualItem(item.id)}
                  title="Delete"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
                    <path
                      fill-rule="evenodd"
                      d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

/* ── Amount Display (handles currency conversion) ─ */

function AmountDisplay(props: { amount: number; currency: Currency; type: ItemType }) {
  const ctx = useMoney();
  const displayCurrency = () => ctx.displayCurrency();
  const rate = () => ctx.exchangeRate()?.usdToIdr ?? 16000;

  const display = createMemo(() => {
    if (displayCurrency() === props.currency) {
      return formatAmount(props.amount, props.currency);
    }
    if (props.currency === "USD") {
      const converted = convertAmount(props.amount, "USD", "IDR", rate());
      return formatAmount(converted, "IDR");
    }
    const converted = convertAmount(props.amount, "IDR", "USD", rate());
    return formatAmount(converted, "USD");
  });

  return (
    <span
      class="item-amount"
      classList={{ income: props.type === "income", expense: props.type === "expense" }}
    >
      {display()}
    </span>
  );
}

/* ── Floating Action Button ─────────────────────── */

function Fab() {
  const [showAdd, setShowAdd] = createSignal(false);

  return (
    <>
      <button class="fab" onClick={() => setShowAdd(true)} title="Add item">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1z" />
        </svg>
      </button>
      <Show when={showAdd()}>
        <AddItemModal onClose={() => setShowAdd(false)} />
      </Show>
    </>
  );
}

/* ── Add Item Modal ─────────────────────────────── */

function AddItemModal(props: { onClose: () => void }) {
  const ctx = useMoney();
  const [type, setType] = createSignal<ItemType>("expense");
  const [name, setName] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [currency, setCurrency] = createSignal<Currency>("USD");
  const [category, setCategory] = createSignal("other");
  const [note, setNote] = createSignal("");
  const [date, setDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = createSignal(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const parsedAmount = parseFloat(amount());
    if (!name().trim() || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const amountInCents =
      currency() === "USD" ? Math.round(parsedAmount * 100) : Math.round(parsedAmount);

    if (isRecurring()) {
      await ctx.addMonthlyItem({
        name: name().trim(),
        type: type(),
        amount: amountInCents,
        currency: currency(),
        category: category() || "other",
        note: note().trim() || undefined,
      });
    } else {
      await ctx.addManualItem({
        name: name().trim(),
        type: type(),
        amount: amountInCents,
        currency: currency(),
        category: category() || "other",
        note: note().trim() || undefined,
        date: date(),
      });
    }

    props.onClose();
  }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">Add Item</span>
          <button class="modal-close" onClick={props.onClose}>
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {/* Type Tabs */}
          <div class="form-group">
            <div class="type-tabs">
              <button
                type="button"
                classList={{ "type-tab": true, active: type() === "income" }}
                onClick={() => setType("income")}
              >
                Income
              </button>
              <button
                type="button"
                classList={{
                  "type-tab": true,
                  active: type() === "expense",
                  expense: type() === "expense",
                }}
                onClick={() => setType("expense")}
              >
                Expense
              </button>
            </div>
          </div>

          {/* Name */}
          <div class="form-group">
            <label class="form-label">Name</label>
            <input
              type="text"
              placeholder="e.g. Salary, Groceries, Rent"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              required
              autofocus
            />
          </div>

          {/* Amount & Currency */}
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Amount</label>
              <input
                type="number"
                step={currency() === "USD" ? "0.01" : "1"}
                min="0"
                placeholder={currency() === "USD" ? "0.00" : "0"}
                value={amount()}
                onInput={(e) => setAmount(e.currentTarget.value)}
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label">Currency</label>
              <select
                value={currency()}
                onChange={(e) => setCurrency(e.currentTarget.value as Currency)}
              >
                <option value="USD">USD ($)</option>
                <option value="IDR">IDR (Rp)</option>
              </select>
            </div>
          </div>

          {/* Category & Date */}
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Category</label>
              <select value={category()} onChange={(e) => setCategory(e.currentTarget.value)}>
                <option value="other">Other</option>
                <option value="salary">Salary</option>
                <option value="freelance">Freelance</option>
                <option value="food">Food</option>
                <option value="housing">Housing</option>
                <option value="transport">Transport</option>
                <option value="utilities">Utilities</option>
                <option value="entertainment">Entertainment</option>
                <option value="shopping">Shopping</option>
                <option value="health">Health</option>
                <option value="education">Education</option>
                <option value="savings">Savings</option>
              </select>
            </div>
            <Show when={!isRecurring()}>
              <div class="form-group">
                <label class="form-label">Date</label>
                <input type="date" value={date()} onInput={(e) => setDate(e.currentTarget.value)} />
              </div>
            </Show>
          </div>

          {/* Note */}
          <div class="form-group">
            <label class="form-label">Note (optional)</label>
            <input
              type="text"
              placeholder="Add a note..."
              value={note()}
              onInput={(e) => setNote(e.currentTarget.value)}
            />
          </div>

          {/* Recurring toggle */}
          <div class="form-group" style="display:flex;align-items:center;gap:8px">
            <button
              type="button"
              class="toggle-switch"
              classList={{ active: isRecurring() }}
              onClick={() => setIsRecurring(!isRecurring())}
            >
              <span class="toggle-thumb" />
            </button>
            <span style="font-size:0.82rem;color:var(--text-secondary)">
              Recurring (appears every month)
            </span>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-ghost" onClick={props.onClose}>
              Cancel
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              disabled={!name().trim() || !amount() || parseFloat(amount()) <= 0}
            >
              Add {isRecurring() ? "Template" : "Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Session Overlays ───────────────────────────── */

function SessionOverlays() {
  const ctx = useMoney();

  return (
    <>
      <Show when={ctx.checkingSession()}>
        <div class="session-overlay">
          <div class="session-overlay-card">
            <div class="session-spinner" />
            <p>Checking your Shedflare Money session…</p>
          </div>
        </div>
      </Show>

      <Show when={!ctx.checkingSession() && ctx.unauthorized()}>
        <div class="session-overlay">
          <div class="session-overlay-card">
            <p>Sign in with the central Shedflare auth worker to access your budget ledger.</p>
            <button type="button" class="btn btn-primary" onClick={ctx.signIn}>
              Sign in
            </button>
          </div>
        </div>
      </Show>
    </>
  );
}

/* ── Toast Container ─────────────────────────────── */

function ToastContainer() {
  const ctx = useMoney();
  const toasts = () => ctx.toasts();

  return (
    <Show when={toasts().length > 0}>
      <div class="toast-container">
        <For each={toasts()}>
          {(toast) => (
            <div
              class="toast"
              classList={{
                "toast-success": toast.type === "success",
                "toast-error": toast.type === "error",
                "toast-info": toast.type === "info",
              }}
            >
              <svg class="toast-icon" viewBox="0 0 16 16" fill="currentColor">
                <Switch>
                  <Match when={toast.type === "success"}>
                    <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z" />
                  </Match>
                  <Match when={toast.type === "error"}>
                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zM8 4a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3A.5.5 0 0 0 8 4zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
                  </Match>
                  <Match when={toast.type === "info"}>
                    <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
                  </Match>
                </Switch>
              </svg>
              <span class="toast-message">{toast.message}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

/* ── Skeleton List ────────────────────────────────── */

function SkeletonList(props: { count: number }) {
  return (
    <div class="skeleton-list">
      <For each={Array.from({ length: props.count })}>{() => <div class="skeleton-row" />}</For>
    </div>
  );
}

/* ── Empty State ──────────────────────────────────── */

function EmptyState(props: { icon: import("solid-js").JSX.Element; text: string; sub: string }) {
  return (
    <div class="empty-state">
      {props.icon}
      <span class="empty-state-text">{props.text}</span>
      <span class="empty-state-sub">{props.sub}</span>
    </div>
  );
}
