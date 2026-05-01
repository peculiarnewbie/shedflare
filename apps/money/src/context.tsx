import { createContext, createEffect, createSignal, useContext } from "solid-js";
import type {
  Currency,
  CurrencyInfo,
  ItemType,
  ManualItem,
  MonthlyItem,
  MonthSummary,
  Toast,
} from "./types";

/* ── Decoders ────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeSessionResponse(value: unknown): { user: { email: string } } | null {
  if (!isRecord(value) || !isRecord(value.user) || typeof value.user.email !== "string")
    return null;
  return { user: { email: value.user.email } };
}

function decodeMonthlyItemsResponse(
  value: unknown,
): { items: MonthlyItem[]; month: string } | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const items = value.items.map(decodeMonthlyItem);
  if (items.some((i) => !i)) return null;
  return { items: items as MonthlyItem[], month: String(value.month) };
}

function decodeMonthlyItem(value: unknown): MonthlyItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    (value.type !== "income" && value.type !== "expense") ||
    typeof value.amount !== "number" ||
    (value.currency !== "USD" && value.currency !== "IDR") ||
    typeof value.category !== "string" ||
    typeof value.note !== "string" ||
    typeof value.sortOrder !== "number" ||
    typeof value.active !== "boolean" ||
    typeof value.createdAt !== "string"
  )
    return null;
  return value as MonthlyItem;
}

function decodeManualItemsResponse(value: unknown): { items: ManualItem[]; month: string } | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const items = value.items.map(decodeManualItem);
  if (items.some((i) => !i)) return null;
  return { items: items as ManualItem[], month: String(value.month) };
}

function decodeManualItem(value: unknown): ManualItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    (value.type !== "income" && value.type !== "expense") ||
    typeof value.amount !== "number" ||
    (value.currency !== "USD" && value.currency !== "IDR") ||
    typeof value.category !== "string" ||
    typeof value.note !== "string" ||
    typeof value.monthKey !== "string" ||
    typeof value.date !== "string" ||
    typeof value.createdAt !== "string"
  )
    return null;
  return value as ManualItem;
}

function decodeSummaryResponse(value: unknown): { summary: MonthSummary } | null {
  if (!isRecord(value) || !isRecord(value.summary)) return null;
  const s = value.summary as Record<string, unknown>;
  if (
    typeof s.income !== "number" ||
    typeof s.expense !== "number" ||
    typeof s.balance !== "number" ||
    typeof s.incomeCount !== "number" ||
    typeof s.expenseCount !== "number"
  )
    return null;
  return { summary: s as unknown as MonthSummary };
}

function decodeRatesResponse(value: unknown): CurrencyInfo | null {
  if (!isRecord(value) || typeof value.usdToIdr !== "number") return null;
  return {
    usdToIdr: value.usdToIdr,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

function decodeCategoriesResponse(value: unknown): string[] | null {
  if (!isRecord(value) || !Array.isArray(value.categories)) return null;
  return value.categories as string[];
}

async function requestJson<T>(
  input: RequestInfo | URL,
  decode: (value: unknown) => T | null,
  init?: RequestInit,
) {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(await response.text());
  const data = decode(await response.json());
  if (!data) throw new Error("Invalid API response");
  return data;
}

/* ── Helpers ─────────────────────────────────────── */

export function formatAmount(amount: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${(amount / 100).toFixed(2)}`;
  }
  // IDR — no decimals
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export function convertAmount(amount: number, from: Currency, to: Currency, rate: number): number {
  if (from === to) return amount;
  if (from === "USD" && to === "IDR") return Math.round(amount * rate);
  // IDR to USD
  return Math.round((amount / rate) * 100) / 100;
}

export function amountInCents(amount: number, currency: Currency): number {
  if (currency === "USD") return Math.round(amount * 100);
  return Math.round(amount);
}

export function formatMonthKey(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function getMonthOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  // Go back 24 months, forward 12
  for (let i = 24; i >= -12; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    options.push(key);
  }
  return options;
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/* ── Context type ────────────────────────────────── */

export type MoneyContextValue = {
  // Session
  checkingSession: () => boolean;
  unauthorized: () => boolean;
  userEmail: () => string;

  // Month
  currentMonth: () => string;
  setCurrentMonth: (v: string) => void;
  monthOptions: () => string[];

  // Monthly items (recurring)
  monthlyItems: () => MonthlyItem[];
  toggleMonthlyItem: (id: string, active: boolean) => Promise<void>;
  addMonthlyItem: (item: {
    name: string;
    type: ItemType;
    amount: number;
    currency: Currency;
    category: string;
    note?: string;
  }) => Promise<void>;
  updateMonthlyItem: (id: string, updates: Partial<MonthlyItem>) => Promise<void>;
  deleteMonthlyItem: (id: string) => Promise<void>;

  // Manual items
  manualItems: () => ManualItem[];
  addManualItem: (item: {
    name: string;
    type: ItemType;
    amount: number;
    currency: Currency;
    category: string;
    note?: string;
    date?: string;
    monthlyItemId?: string;
  }) => Promise<void>;
  deleteManualItem: (id: string) => Promise<void>;

  // Summary
  summary: () => MonthSummary | null;

  // Currency
  displayCurrency: () => Currency;
  setDisplayCurrency: (v: Currency) => void;
  exchangeRate: () => CurrencyInfo | null;
  updateExchangeRate: (rate: number) => Promise<void>;

  // Categories
  categories: () => string[];

  // UI state
  toasts: () => Toast[];
  addToast: (message: string, type?: Toast["type"]) => void;

  // Auth
  signIn: () => void;
  loading: () => boolean;
};

const MoneyCtx = createContext<MoneyContextValue>();

export function useMoney() {
  const ctx = useContext(MoneyCtx);
  if (!ctx) throw new Error("useMoney must be used within MoneyProvider");
  return ctx;
}

/* ── Provider ────────────────────────────────────── */

export function MoneyProvider(props: { children: import("solid-js").JSX.Element }) {
  const [checkingSession, setCheckingSession] = createSignal(true);
  const [unauthorized, setUnauthorized] = createSignal(false);
  const [userEmail, setUserEmail] = createSignal("");

  const [currentMonth, setCurrentMonth] = createSignal(getCurrentMonthKey());
  const [monthlyItems, setMonthlyItems] = createSignal<MonthlyItem[]>([]);
  const [manualItems, setManualItems] = createSignal<ManualItem[]>([]);
  const [summary, setSummary] = createSignal<MonthSummary | null>(null);
  const [categories, setCategories] = createSignal<string[]>([]);

  const [displayCurrency, setDisplayCurrency] = createSignal<Currency>("USD");
  const [exchangeRate, setExchangeRate] = createSignal<CurrencyInfo | null>(null);

  const [toasts, setToasts] = createSignal<Toast[]>([]);
  const [loading, setLoading] = createSignal(false);

  /* ── Data Loading ────────────────────────── */

  async function loadMonthlyItems(month: string) {
    const data = await requestJson(
      `/api/money/monthly-items?month=${month}`,
      decodeMonthlyItemsResponse,
    );
    setMonthlyItems(data.items);
  }

  async function loadManualItems(month: string) {
    const data = await requestJson(`/api/money/items?month=${month}`, decodeManualItemsResponse);
    setManualItems(data.items);
  }

  async function loadSummary(month: string) {
    const data = await requestJson(`/api/money/summary?month=${month}`, decodeSummaryResponse);
    setSummary(data.summary);
  }

  async function loadCategories() {
    try {
      const data = await requestJson("/api/money/categories", decodeCategoriesResponse);
      setCategories(data);
    } catch {
      // Silently fail
    }
  }

  async function loadRates() {
    try {
      const data = await requestJson("/api/money/rates", decodeRatesResponse);
      setExchangeRate(data);
    } catch {
      // Silently fail
    }
  }

  async function bootstrap() {
    try {
      const session = await requestJson("/api/session", decodeSessionResponse);
      setUserEmail(session.user.email);
      setUnauthorized(false);
      const month = currentMonth();
      await Promise.all([
        loadMonthlyItems(month),
        loadManualItems(month),
        loadSummary(month),
        loadCategories(),
        loadRates(),
      ]);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Unauthorized")) {
        setUnauthorized(true);
        return;
      }
    } finally {
      setCheckingSession(false);
    }
  }

  createEffect(() => {
    const month = currentMonth();
    setLoading(true);
    if (!userEmail()) return;
    Promise.all([loadMonthlyItems(month), loadManualItems(month), loadSummary(month)]).finally(() =>
      setLoading(false),
    );
  });

  void bootstrap();

  /* ── Actions ─────────────────────────────── */

  async function toggleMonthlyItem(id: string, active: boolean) {
    try {
      await fetch(
        `/api/money/monthly-items/${id}/toggle?month=${currentMonth()}&active=${active}`,
        {
          method: "POST",
        },
      );
      setMonthlyItems((prev) => prev.map((item) => (item.id === id ? { ...item, active } : item)));
      await loadSummary(currentMonth());
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Failed to toggle item", "error");
    }
  }

  async function addMonthlyItem(item: {
    name: string;
    type: ItemType;
    amount: number;
    currency: Currency;
    category: string;
    note?: string;
  }) {
    setLoading(true);
    try {
      await fetch("/api/money/monthly-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item),
      });
      await Promise.all([
        loadMonthlyItems(currentMonth()),
        loadSummary(currentMonth()),
        loadCategories(),
      ]);
      addToast(`Added "${item.name}"`, "success");
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Failed to add item", "error");
    } finally {
      setLoading(false);
    }
  }

  async function updateMonthlyItem(id: string, updates: Partial<MonthlyItem>) {
    try {
      await fetch(`/api/money/monthly-items/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (updates.amount !== undefined || updates.type !== undefined) {
        await loadSummary(currentMonth());
      }
      await loadMonthlyItems(currentMonth());
      addToast("Item updated", "success");
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Failed to update item", "error");
    }
  }

  async function deleteMonthlyItem(id: string) {
    try {
      await fetch(`/api/money/monthly-items/${id}`, { method: "DELETE" });
      await Promise.all([loadMonthlyItems(currentMonth()), loadSummary(currentMonth())]);
      addToast("Item deleted");
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Failed to delete item", "error");
    }
  }

  async function addManualItem(item: {
    name: string;
    type: ItemType;
    amount: number;
    currency: Currency;
    category: string;
    note?: string;
    date?: string;
    monthlyItemId?: string;
  }) {
    setLoading(true);
    try {
      await fetch("/api/money/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...item, monthKey: currentMonth() }),
      });
      await Promise.all([
        loadManualItems(currentMonth()),
        loadSummary(currentMonth()),
        loadCategories(),
      ]);
      addToast(`Added "${item.name}"`, "success");
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Failed to add item", "error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteManualItem(id: string) {
    try {
      await fetch(`/api/money/items/${id}`, { method: "DELETE" });
      await Promise.all([loadManualItems(currentMonth()), loadSummary(currentMonth())]);
      addToast("Item deleted");
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Failed to delete item", "error");
    }
  }

  async function updateExchangeRate(rate: number) {
    try {
      await fetch("/api/money/rates", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usdToIdr: Math.round(rate) }),
      });
      await loadRates();
      addToast("Exchange rate updated", "success");
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Failed to update rate", "error");
    }
  }

  /* ── Toast ───────────────────────────────── */

  function addToast(message: string, type: Toast["type"] = "info") {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  function signIn() {
    window.location.assign("/api/auth/login");
  }

  /* ── Derived ─────────────────────────────── */

  const monthOptions = () => getMonthOptions();

  /* ── Value ────────────────────────────────── */

  const value: MoneyContextValue = {
    checkingSession,
    unauthorized,
    userEmail,
    currentMonth,
    setCurrentMonth,
    monthOptions,
    monthlyItems,
    toggleMonthlyItem,
    addMonthlyItem,
    updateMonthlyItem,
    deleteMonthlyItem,
    manualItems,
    addManualItem,
    deleteManualItem,
    summary,
    displayCurrency,
    setDisplayCurrency,
    exchangeRate,
    updateExchangeRate,
    categories,
    toasts,
    addToast,
    signIn,
    loading,
  };

  return <MoneyCtx.Provider value={value}>{props.children}</MoneyCtx.Provider>;
}
