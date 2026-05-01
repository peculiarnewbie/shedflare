export type ItemType = "income" | "expense";
export type Currency = "USD" | "IDR";

export type MonthlyItem = {
  id: string;
  name: string;
  type: ItemType;
  amount: number;
  currency: Currency;
  category: string;
  note: string;
  sortOrder: number;
  active: boolean; // whether toggled on for current month
  createdAt: string;
};

export type ManualItem = {
  id: string;
  monthlyItemId: string | null;
  name: string;
  type: ItemType;
  amount: number;
  currency: Currency;
  category: string;
  note: string;
  monthKey: string;
  date: string;
  createdAt: string;
};

export type MonthSummary = {
  income: number;
  expense: number;
  balance: number;
  incomeCount: number;
  expenseCount: number;
};

export type CurrencyInfo = {
  usdToIdr: number;
  updatedAt: string;
};

export type Toast = {
  id: string;
  message: string;
  type: "info" | "success" | "error";
};
