// ---------------------------------------------------------------------------
// Shared types for all chart components
// ---------------------------------------------------------------------------

/** Standard chart dimensions */
export interface ChartDimensions {
  width: number;
  height: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
}

export function defaultDimensions(overrides?: Partial<ChartDimensions>): ChartDimensions {
  return {
    width: 600,
    height: 300,
    marginTop: 20,
    marginBottom: 30,
    marginLeft: 60,
    marginRight: 20,
    ...overrides,
  };
}

/** Accessible inner drawing area */
export interface ChartBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeBounds(d: ChartDimensions): ChartBounds {
  return {
    x: d.marginLeft ?? 0,
    y: d.marginTop ?? 0,
    width: d.width - (d.marginLeft ?? 0) - (d.marginRight ?? 0),
    height: d.height - (d.marginTop ?? 0) - (d.marginBottom ?? 0),
  };
}

/** Color palette matching the app's design system */
export const CHART_COLORS = {
  primary: "#6366f1",
  primaryLight: "#818cf8",
  positive: "#22c55e",
  negative: "#ef4444",
  warning: "#f59e0b",
  accent: "#a78bfa",
  grid: "#2e2e32",
  text: "#9b9ba3",
  area: "rgba(99, 102, 241, 0.15)",
  areaPositive: "rgba(34, 197, 94, 0.15)",
  areaNegative: "rgba(239, 68, 68, 0.15)",
} as const;

/** Categorical palette (auto-generated 10-color scheme) */
export function categoryColor(index: number): string {
  const palette = [
    "#6366f1",
    "#22c55e",
    "#f59e0b",
    "#ef4444",
    "#a78bfa",
    "#06b6d4",
    "#f97316",
    "#84cc16",
    "#ec4899",
    "#14b8a6",
  ];
  return palette[index % palette.length];
}

// ---------------------------------------------------------------------------
// Data point types
// ---------------------------------------------------------------------------

/** A single point on a time-series line/area chart */
export interface TimeSeriesPoint {
  date: string; // ISO date or "YYYY-MM"
  value: number; // in cents
  label?: string;
}

/** One bar group in a bar chart */
export interface BarGroup {
  category: string;
  values: BarValue[];
}

export interface BarValue {
  label: string;
  value: number; // in cents
  color?: string;
}

/** One slice in a donut/pie chart */
export interface PieSlice {
  label: string;
  value: number; // in cents (absolute, positive)
  color?: string;
}

/** One row in a budget vs actuals chart */
export interface BudgetPair {
  category: string;
  budgeted: number; // in cents
  actual: number; // in cents (spent)
  color?: string;
}

// ---------------------------------------------------------------------------
// Utility: format cents for chart axis labels
// ---------------------------------------------------------------------------

export type MoneyFormatter = (cents: number) => string;

export function formatChartAmount(cents: number, formatValue?: MoneyFormatter): string {
  if (formatValue) return formatValue(cents);

  const abs = Math.abs(cents);
  const sign = cents < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 100 / 1_000).toFixed(1)}K`;
  }
  if (abs >= 100_000) {
    return `${sign}$${(abs / 100).toFixed(0)}`;
  }
  return `${sign}$${(abs / 100).toFixed(0)}`;
}

/** Format cents as full dollar string for tooltips */
export function formatChartTooltip(cents: number, formatValue?: MoneyFormatter): string {
  if (formatValue) return formatValue(cents);

  const abs = Math.abs(cents);
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}
