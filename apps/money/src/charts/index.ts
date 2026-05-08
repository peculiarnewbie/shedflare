/**
 * Charts module — pluggable D3-based chart components for SolidJS.
 *
 * Usage:
 *   import { AreaChart, BarChart, DonutChart, BudgetBar } from "../charts";
 *   import type { TimeSeriesPoint, BarGroup, PieSlice, BudgetPair } from "../charts";
 *
 * Each component is a standalone SolidJS component that renders an SVG
 * using D3 for scale/path computation and SolidJS for DOM rendering.
 * No imperative DOM manipulation — fully reactive.
 */

export { default as AreaChart } from "./AreaChart";
export { default as BarChart } from "./BarChart";
export { default as DonutChart } from "./DonutChart";
export { default as BudgetBar } from "./BudgetBar";

export type { AreaChartProps } from "./AreaChart";
export type { BarChartProps } from "./BarChart";
export type { DonutChartProps } from "./DonutChart";
export type { BudgetBarProps } from "./BudgetBar";

export {
  type TimeSeriesPoint,
  type BarGroup,
  type BarValue,
  type PieSlice,
  type BudgetPair,
  type ChartDimensions,
  type ChartBounds,
  CHART_COLORS,
  categoryColor,
  formatChartAmount,
  formatChartTooltip,
  defaultDimensions,
  computeBounds,
} from "./types";
