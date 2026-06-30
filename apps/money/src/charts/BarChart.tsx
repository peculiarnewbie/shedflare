/**
 * BarChart — grouped or stacked bars.
 * Used for cash flow (income vs expenses by month), category comparisons.
 *
 * Pure SolidJS + D3 scales. Fully reactive through Solid's template system.
 */
import { createMemo, For, Show } from "solid-js";
import * as d3 from "d3";
import {
  type BarGroup,
  type ChartDimensions,
  defaultDimensions,
  computeBounds,
  CHART_COLORS,
  formatChartAmount,
} from "./types";

export interface BarChartProps {
  /** Groups of bars — each group is one category on the x-axis */
  groups: BarGroup[];
  /** Dimension overrides */
  dimensions?: Partial<ChartDimensions>;
  /** Whether bars within a group are stacked (true) or side-by-side (false) */
  stacked?: boolean;
  /** Gap ratio between groups (0-1, default 0.2) */
  groupPadding?: number;
  /** Gap ratio within groups (0-1, default 0.1) */
  barPadding?: number;
  /** Format for y-axis labels */
  formatY?: (v: number) => string;
  /** Format money values in tooltips and default axis labels */
  formatValue?: (v: number) => string;
  /** Format for x-axis labels */
  formatX?: (label: string) => string;
  /** Chart-level label when there's only one value per group */
  label?: string;
}

export default function BarChart(props: BarChartProps) {
  const dims = createMemo(() => defaultDimensions(props.dimensions));
  const bounds = createMemo(() => computeBounds(dims()));
  const stacked = () => props.stacked ?? false;

  // X scale (ordinal by group category)
  const xScale = createMemo(() => {
    const g = props.groups;
    if (g.length === 0) return null;
    return d3
      .scaleBand()
      .domain(g.map((grp) => grp.category))
      .range([bounds().x, bounds().x + bounds().width])
      .padding(props.groupPadding ?? 0.2);
  });

  // Inner scale for bars within a group (side-by-side mode)
  const innerScale = createMemo(() => {
    const g = props.groups;
    const xs = xScale();
    if (!xs || g.length === 0) return null;
    // Use max values length across all groups
    const maxValues = d3.max(g, (grp) => grp.values.length) ?? 1;
    return d3
      .scaleBand()
      .domain(d3.range(maxValues).map(String))
      .range([0, xs.bandwidth()])
      .padding(props.barPadding ?? 0.1);
  });

  // Y scale
  const yScale = createMemo(() => {
    const g = props.groups;
    if (g.length === 0) return null;

    let maxVal = 0;
    if (stacked()) {
      // Stacked: sum of all values in each group
      maxVal = d3.max(g, (grp) => d3.sum(grp.values, (v) => Math.abs(v.value))) ?? 0;
    } else {
      // Side-by-side: max individual value
      maxVal = d3.max(g, (grp) => d3.max(grp.values, (v) => Math.abs(v.value))) ?? 0;
    }

    const padding = maxVal * 0.1 || 1;
    return d3
      .scaleLinear()
      .domain([-(maxVal + padding) * 0.1, maxVal + padding])
      .range([bounds().y + bounds().height, bounds().y]);
  });

  // Y-axis ticks
  const yTicks = createMemo(() => {
    const ys = yScale();
    if (!ys) return [];
    return ys.ticks(5).map((v) => ({
      value: v,
      y: ys(v),
      label: props.formatY ? props.formatY(v) : formatChartAmount(v, props.formatValue),
    }));
  });

  // X-axis ticks
  const xTicks = createMemo(() => {
    const xs = xScale();
    const g = props.groups;
    if (!xs) return [];
    return g.map((grp) => ({
      label: props.formatX ? props.formatX(grp.category) : grp.category,
      x: xs(grp.category)! + xs.bandwidth() / 2,
    }));
  });

  // Compute bar positions
  const bars = createMemo(() => {
    const xs = xScale();
    const ins = innerScale();
    const ys = yScale();
    const g = props.groups;

    if (!xs || !ys) return [];
    const result: Array<{
      key: string;
      x: number;
      y: number;
      width: number;
      height: number;
      value: number;
      label: string;
      color: string;
    }> = [];

    for (const grp of g) {
      if (stacked()) {
        // Stacked mode: bars stack on top of each other
        let yOffset = 0;
        for (let vi = 0; vi < grp.values.length; vi++) {
          const val = grp.values[vi]!;
          const barHeight = Math.abs(ys(0) - ys(Math.abs(val.value)));
          const y = val.value >= 0 ? ys(0) - yOffset - barHeight : ys(0) + yOffset;
          result.push({
            key: `${grp.category}-${vi}`,
            x: xs(grp.category)!,
            y,
            width: xs.bandwidth(),
            height: barHeight,
            value: val.value,
            label: val.label,
            color: val.color ?? CHART_COLORS.primary,
          });
          yOffset += barHeight;
        }
      } else {
        // Side-by-side mode
        if (!ins) continue;
        for (let vi = 0; vi < grp.values.length; vi++) {
          const val = grp.values[vi]!;
          const barHeight = Math.abs(ys(Math.max(0, val.value)) - ys(val.value));
          const y = val.value >= 0 ? ys(val.value) : ys(0);
          result.push({
            key: `${grp.category}-${vi}`,
            x: xs(grp.category)! + ins(String(vi))!,
            y,
            width: ins.bandwidth(),
            height: Math.max(barHeight, 1),
            value: val.value,
            label: val.label,
            color: val.color ?? CHART_COLORS.primary,
          });
        }
      }
    }

    return result;
  });

  // Legend (only if multiple values per group)
  const legend = createMemo(() => {
    const g = props.groups;
    if (g.length === 0) return [];
    const maxValues = g.reduce((max, grp) => Math.max(max, grp.values.length), 0);
    if (maxValues <= 1) return [];
    return g[0]!.values.map((v, i) => ({
      label: v.label,
      color: v.color ?? CHART_COLORS.primary,
      index: i,
    }));
  });

  return (
    <Show when={props.groups.length > 0 && bars().length > 0} fallback={<EmptyChart />}>
      <div class="chart-container">
        {/* Legend */}
        <Show when={legend().length > 0}>
          <div
            class="chart-legend"
            style={{
              display: "flex",
              gap: "16px",
              "justify-content": "center",
              "margin-bottom": "8px",
              "flex-wrap": "wrap",
            }}
          >
            <For each={legend()}>
              {(item) => (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "6px",
                    "font-size": "0.8rem",
                  }}
                >
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      "border-radius": "2px",
                      background: item.color,
                      display: "inline-block",
                    }}
                  />
                  <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                </div>
              )}
            </For>
          </div>
        </Show>

        <svg
          viewBox={`0 0 ${dims().width} ${dims().height}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Y-axis grid */}
          <For each={yTicks()}>
            {(tick) => (
              <g>
                <line
                  x1={bounds().x}
                  x2={bounds().x + bounds().width}
                  y1={tick.y}
                  y2={tick.y}
                  stroke={CHART_COLORS.grid}
                  stroke-width="1"
                  stroke-dasharray="4,4"
                />
                <text
                  x={bounds().x - 8}
                  y={tick.y + 4}
                  text-anchor="end"
                  fill={CHART_COLORS.text}
                  font-size="11"
                >
                  {tick.label}
                </text>
              </g>
            )}
          </For>

          {/* Zero line */}
          <Show when={yScale()}>
            <line
              x1={bounds().x}
              x2={bounds().x + bounds().width}
              y1={yScale()!(0)}
              y2={yScale()!(0)}
              stroke={CHART_COLORS.text}
              stroke-width="1"
            />
          </Show>

          {/* Bars */}
          <For each={bars()}>
            {(bar) => (
              <g>
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  fill={bar.color}
                  rx="2"
                  opacity="0.85"
                >
                  <title>{`${bar.label}: ${(props.formatValue ?? formatChartAmount)(bar.value)}`}</title>
                </rect>
              </g>
            )}
          </For>

          {/* X-axis labels */}
          <For each={xTicks()}>
            {(tick) => (
              <text
                x={tick.x}
                y={bounds().y + bounds().height + 16}
                text-anchor="middle"
                fill={CHART_COLORS.text}
                font-size="10"
              >
                {tick.label}
              </text>
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
        height: "200px",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        color: "var(--text-muted)",
        "font-size": "0.9rem",
      }}
    >
      Insufficient data for chart
    </div>
  );
}
