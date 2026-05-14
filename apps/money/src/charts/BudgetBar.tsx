/**
 * BudgetBar — horizontal grouped bars comparing budgeted vs actual spending.
 * Used for budget analysis (budget vs actuals per category).
 *
 * Pure SolidJS + D3 scales. Fully reactive.
 */
import { createMemo, For, Show } from "solid-js";
import * as d3 from "d3";
import {
  type BudgetPair,
  type ChartDimensions,
  CHART_COLORS,
  formatChartAmount,
  formatChartTooltip,
} from "./types";

export interface BudgetBarProps {
  /** Array of budget vs actual pairs, one per category */
  data: BudgetPair[];
  /** Dimension overrides — note: height is auto-computed from row count */
  dimensions?: Partial<ChartDimensions>;
  /** Row height in pixels (default 28) */
  rowHeight?: number;
  /** Whether to show axis (default true) */
  showAxis?: boolean;
  /** Max categories to show (default 15) */
  maxCategories?: number;
}

export default function BudgetBar(props: BudgetBarProps) {
  const maxCats = () => props.maxCategories ?? 15;
  const rowH = () => props.rowHeight ?? 28;
  const headerH = 24;
  const pad = 16;

  // Sort by absolute difference (most over-budget first)
  const sorted = createMemo(() =>
    [...props.data]
      .sort((a, b) => Math.abs(b.actual - b.budgeted) - Math.abs(a.actual - a.budgeted))
      .slice(0, maxCats()),
  );

  const itemCount = () => sorted().length;

  // Dynamic height based on row count
  const chartHeight = () => itemCount() * rowH() + headerH + pad;
  const barAreaWidth = 300;
  const labelWidth = 140;
  const totalWidth = labelWidth + barAreaWidth + 10;

  // X scale (shared across all rows)
  const xScale = createMemo(() => {
    const data = sorted();
    if (data.length === 0) return null;
    const maxVal = d3.max(data, (d) => Math.max(Math.abs(d.budgeted), Math.abs(d.actual))) ?? 1;
    const padding = maxVal * 0.15 || 1;
    return d3
      .scaleLinear()
      .domain([0, maxVal + padding])
      .range([0, barAreaWidth]);
  });

  // Bar positions for each item
  const bars = createMemo(() => {
    const xs = xScale();
    if (!xs) return [];

    return sorted().map((item, i) => {
      const y = i * rowH() + headerH;
      const bW = xs(Math.abs(item.budgeted));
      const aW = xs(Math.abs(item.actual));
      const over = item.actual < 0 && Math.abs(item.actual) > Math.abs(item.budgeted);

      // Budgeted bar (lighter, behind)
      const budgetBar = {
        x: labelWidth,
        y: y + 4,
        width: bW,
        height: rowH() * 0.4,
        fill: CHART_COLORS.grid,
      };

      // Actual bar (solid, in front, can be shorter or longer)
      const actualWidth = Math.min(aW, barAreaWidth);
      const actualBar = {
        x: labelWidth,
        y: y + rowH() * 0.5,
        width: actualWidth,
        height: rowH() * 0.4,
        fill: over ? CHART_COLORS.negative : CHART_COLORS.primary,
      };

      // Overspend indicator (red extension beyond budget bar)
      const overshoot = aW > bW ? aW - bW : 0;
      const overshootBar =
        overshoot > 4
          ? {
              x: labelWidth + bW,
              y: y + rowH() * 0.5,
              width: overshoot,
              height: rowH() * 0.4,
              fill: CHART_COLORS.negative,
              opacity: 0.6,
            }
          : null;

      return {
        item,
        y,
        budgetBar,
        actualBar,
        overshootBar,
        remaining: Math.abs(item.budgeted) - Math.abs(item.actual),
      };
    });
  });

  return (
    <Show when={itemCount() > 0} fallback={<EmptyChart />}>
      <div class="chart-container">
        <svg
          viewBox={`0 0 ${totalWidth} ${chartHeight()}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Header */}
          <text x={0} y={14} fill="var(--text-secondary)" font-size="11" font-weight="600">
            Category
          </text>
          <text
            x={labelWidth + barAreaWidth}
            y={14}
            text-anchor="end"
            fill="var(--text-secondary)"
            font-size="11"
            font-weight="600"
          >
            Budgeted vs Spent
          </text>

          {/* Rows */}
          <For each={bars()}>
            {(row) => (
              <g>
                {/* Category label */}
                <text
                  x={0}
                  y={row.y + rowH() / 2 + 4}
                  fill="var(--text)"
                  font-size="12"
                  text-overflow="ellipsis"
                  style={{ "max-width": `${labelWidth}px` }}
                >
                  {row.item.category.length > 22
                    ? row.item.category.slice(0, 20) + "..."
                    : row.item.category}
                </text>

                {/* Budget bar (background) */}
                <rect {...row.budgetBar} rx="2" opacity="0.3" />

                {/* Overshoot indicator */}
                <Show when={row.overshootBar}>
                  <rect {...row.overshootBar!} rx="2" />
                </Show>

                {/* Actual bar */}
                <rect {...row.actualBar} rx="2" opacity="0.85">
                  <title>
                    {`${row.item.category}: Budgeted ${formatChartTooltip(row.item.budgeted)}, Spent ${formatChartTooltip(row.item.actual)}`}
                  </title>
                </rect>

                {/* Value labels */}
                <text
                  x={labelWidth + barAreaWidth + 6}
                  y={row.y + rowH() / 2 - 2}
                  fill="var(--text-secondary)"
                  font-size="10"
                >
                  B: {formatChartAmount(row.item.budgeted)}
                </text>
                <text
                  x={labelWidth + barAreaWidth + 6}
                  y={row.y + rowH() / 2 + 12}
                  fill="var(--text)"
                  font-size="10"
                >
                  S: {formatChartAmount(row.item.actual)}
                </text>
              </g>
            )}
          </For>
        </svg>
      </div>
    </Show>
  );
}

function EmptyChart() {
  return (
    <div
      class="chart-empty"
      style={{
        height: "100px",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        color: "var(--text-muted)",
        "font-size": "0.9rem",
      }}
    >
      No budget data for this period
    </div>
  );
}
