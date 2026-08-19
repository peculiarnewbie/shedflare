/**
 * AreaChart — filled area with a line on top.
 * Used for net worth, account balance over time.
 *
 * Pure SolidJS + D3 (scales only — no imperative DOM).
 * Render is fully reactive through Solid's template system.
 */
import { createMemo, For, Show } from "solid-js";
import * as d3 from "d3";
import {
  type TimeSeriesPoint,
  type ChartDimensions,
  defaultDimensions,
  computeBounds,
  CHART_COLORS,
  formatChartAmount,
  formatChartTooltip,
} from "./types";

export interface AreaChartProps {
  data: TimeSeriesPoint[];
  /** Optional: dimension overrides */
  dimensions?: Partial<ChartDimensions>;
  /** CSS color for the fill */
  fillColor?: string;
  /** CSS color for the line */
  strokeColor?: string;
  /** Number of y-axis ticks (default 5) */
  yTicks?: number;
  /** Format for y-axis labels */
  formatY?: (v: number) => string;
  /** Format money values in summaries and default axis labels */
  formatValue?: (v: number) => string;
  /** Format for x-axis labels */
  formatX?: (d: string) => string;
  /** Minimum height of the SVG */
  minHeight?: number;
}

export default function AreaChart(props: AreaChartProps) {
  const dims = createMemo(() => defaultDimensions(props.dimensions));
  const bounds = createMemo(() => computeBounds(dims()));

  // Parse dates and sort
  const sorted = createMemo(() =>
    [...props.data]
      .map((d) => ({ ...d, parsed: new Date(d.date + (d.date.length <= 7 ? "-01" : "")) }))
      .sort((a, b) => a.parsed.getTime() - b.parsed.getTime()),
  );

  // Scales
  const xScale = createMemo(() => {
    const s = sorted();
    if (s.length === 0) return null;
    return d3
      .scaleTime()
      .domain([s[0].parsed, s[s.length - 1].parsed])
      .range([bounds().x, bounds().x + bounds().width]);
  });

  const yScale = createMemo(() => {
    const s = sorted();
    if (s.length === 0) return null;
    const min = d3.min(s, (d) => d.value) ?? 0;
    const max = d3.max(s, (d) => d.value) ?? 1;
    const padding = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
    return d3
      .scaleLinear()
      .domain([Math.min(0, min - padding), Math.max(0, max + padding)])
      .range([bounds().y + bounds().height, bounds().y]);
  });

  // Area path
  const areaPath = createMemo(() => {
    const xs = xScale();
    const ys = yScale();
    const s = sorted();
    if (!xs || !ys || s.length === 0) return "";

    const area = d3
      .area<{ parsed: Date; value: number }>()
      .x((d) => xs(d.parsed))
      .y0(ys(0))
      .y1((d) => ys(d.value))
      .curve(d3.curveMonotoneX);

    return area(s) ?? "";
  });

  // Line path
  const linePath = createMemo(() => {
    const xs = xScale();
    const ys = yScale();
    const s = sorted();
    if (!xs || !ys || s.length === 0) return "";

    const line = d3
      .line<{ parsed: Date; value: number }>()
      .x((d) => xs(d.parsed))
      .y((d) => ys(d.value))
      .curve(d3.curveMonotoneX);

    return line(s) ?? "";
  });

  // Y-axis ticks
  const yTicks = createMemo(() => {
    const ys = yScale();
    if (!ys) return [];
    const count = props.yTicks ?? 5;
    return ys.ticks(count).map((v) => ({
      value: v,
      y: ys(v),
      label: props.formatY ? props.formatY(v) : formatChartAmount(v, props.formatValue),
    }));
  });

  // X-axis ticks
  const xTicks = createMemo(() => {
    const xs = xScale();
    const s = sorted();
    if (!xs || s.length === 0) return [];

    // Pick reasonable number of ticks based on data length
    const count = Math.min(s.length, 6);
    const ticks = xs.ticks(count);
    const formatter = props.formatX ?? ((d: string) => d);

    return ticks.map((t) => {
      const dateStr = t.toISOString().slice(0, 7);
      return {
        date: t,
        x: xs(t),
        label: formatter(dateStr),
      };
    });
  });

  // Allow hover / tooltip by tracking nearest point
  // (We'll keep it simple — just show last value + change)

  const lastValue = createMemo(() => {
    const s = sorted();
    if (s.length === 0) return null;
    return s[s.length - 1]!;
  });

  const firstValue = createMemo(() => {
    const s = sorted();
    if (s.length === 0) return null;
    return s[0]!;
  });

  const change = createMemo(() => {
    const last = lastValue();
    const first = firstValue();
    if (!last || !first) return null;
    return last.value - first.value;
  });

  const fillColor = () => props.fillColor ?? CHART_COLORS.primary;
  const strokeColor = () => props.strokeColor ?? CHART_COLORS.primary;
  const strokeWidth = 2;

  return (
    <Show when={sorted().length > 1} fallback={<EmptyChart />}>
      <div class="chart-container" style={{ position: "relative" }}>
        {/* Summary overlay */}
        <div
          class="chart-summary"
          style={{
            position: "absolute",
            top: "8px",
            left: "16px",
            "z-index": 1,
          }}
        >
          <Show when={lastValue()}>
            <div
              class="chart-last-value"
              style={{
                "font-size": "1.5rem",
                "font-weight": 700,
                color: "var(--text)",
              }}
            >
              {formatChartTooltip(lastValue()?.value ?? 0, props.formatValue)}
            </div>
            <Show when={change() !== null}>
              <div
                style={{
                  "font-size": "0.85rem",
                  color: (change() ?? 0) >= 0 ? CHART_COLORS.positive : CHART_COLORS.negative,
                }}
              >
                {(change() ?? 0) >= 0 ? "+" : ""}
                {formatChartTooltip(change() ?? 0, props.formatValue)} this period
              </div>
            </Show>
          </Show>
        </div>

        <svg
          viewBox={`0 0 ${dims().width} ${dims().height}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Y-axis grid lines */}
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

          {/* X-axis ticks */}
          <For each={xTicks()}>
            {(tick) => (
              <g>
                <line
                  x1={tick.x}
                  x2={tick.x}
                  y1={bounds().y + bounds().height}
                  y2={bounds().y + bounds().height + 6}
                  stroke={CHART_COLORS.grid}
                  stroke-width="1"
                />
                <text
                  x={tick.x}
                  y={bounds().y + bounds().height + 18}
                  text-anchor="middle"
                  fill={CHART_COLORS.text}
                  font-size="11"
                >
                  {tick.label}
                </text>
              </g>
            )}
          </For>

          {/* Zero line (if y-domain crosses zero) */}
          <Show
            when={
              yScale() && yScale()!(0) >= bounds().y && yScale()!(0) <= bounds().y + bounds().height
            }
          >
            <line
              x1={bounds().x}
              x2={bounds().x + bounds().width}
              y1={yScale()!(0)}
              y2={yScale()!(0)}
              stroke={CHART_COLORS.text}
              stroke-width="1"
              stroke-dasharray="2,2"
              opacity="0.5"
            />
          </Show>

          {/* Area fill */}
          <path d={areaPath()} fill={fillColor()} fill-opacity="0.15" />

          {/* Line */}
          <path
            d={linePath()}
            fill="none"
            stroke={strokeColor()}
            stroke-width={strokeWidth}
            stroke-linejoin="round"
            stroke-linecap="round"
          />

          {/* Data dots (last point only, for visual anchor) */}
          <Show when={sorted().length > 0 && xScale() && yScale()}>
            <circle
              cx={xScale()!(sorted()[sorted().length - 1]!.parsed)}
              cy={yScale()!(sorted()[sorted().length - 1]!.value)}
              r={4}
              fill={strokeColor()}
              stroke="var(--bg-card)"
              stroke-width="2"
            />
          </Show>
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
      Not enough data to display chart
    </div>
  );
}
