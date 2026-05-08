/**
 * DonutChart — circular chart with arc slices and center label.
 * Used for spending breakdown by category.
 *
 * Pure SolidJS + D3 arc/pie generators. Fully reactive.
 */
import { createMemo, For, Show } from "solid-js";
import * as d3 from "d3";
import {
  type PieSlice,
  type ChartDimensions,
  defaultDimensions,
  CHART_COLORS,
  formatChartTooltip,
  categoryColor,
} from "./types";

export interface DonutChartProps {
  /** Data slices — values should be positive (absolute) */
  slices: PieSlice[];
  /** Dimension overrides */
  dimensions?: Partial<ChartDimensions>;
  /** Inner radius ratio (0 = pie, 0.5-0.7 = donut). Default 0.6 */
  innerRadiusRatio?: number;
  /** Donut thickness in px (overrides innerRadiusRatio if set) */
  thickness?: number;
  /** Whether to show legend (default true) */
  showLegend?: boolean;
}

export default function DonutChart(props: DonutChartProps) {
  const dims = createMemo(() => defaultDimensions(props.dimensions));
  const { width, height } = dims();
  const radius = Math.min(width, height) / 2 - 10;
  const innerRatio = () => props.innerRadiusRatio ?? 0.6;
  const innerRadius = () => props.thickness ? Math.max(0, radius - props.thickness) : radius * innerRatio();
  const cx = width / 2;
  const cy = height / 2 + 10; // shift down slightly to leave room for legend

  // Ensure positive values and filter zeros
  const positiveSlices = createMemo(() => {
    const total = d3.sum(props.slices, (s) => Math.abs(s.value));
    return props.slices
      .map((s) => ({ ...s, value: Math.abs(s.value) }))
      .filter((s) => s.value > 0 && s.value / total >= 0.005); // filter < 0.5%
  });

  // Assign colors to slices
  const colored = createMemo(() =>
    positiveSlices().map((s, i) => ({
      ...s,
      color: s.color ?? categoryColor(i),
    })),
  );

  // Pie generator
  const pie = createMemo(() => {
    const arcs = d3
      .pie<PieSlice>()
      .value((d) => d.value)
      .sort(null)(colored());

    // Arc generators
    const arc = d3.arc<d3.PieArcDatum<PieSlice>>()
      .innerRadius(innerRadius())
      .outerRadius(radius);

    const hoverArc = d3.arc<d3.PieArcDatum<PieSlice>>()
      .innerRadius(innerRadius())
      .outerRadius(radius + 8);

    return arcs.map((a) => ({
      ...a,
      arcPath: arc(a) ?? "",
      hoverPath: hoverArc(a) ?? "",
    }));
  });

  // Total for center label
  const total = createMemo(() => d3.sum(colored(), (d) => d.value));

  // Legend items (sorted largest first)
  const legendItems = createMemo(() =>
    [...colored()].sort((a, b) => b.value - a.value),
  );

  // Empty state
  const hasData = () => pie().length > 0;

  return (
    <Show when={hasData()} fallback={<EmptyChart />}>
      <div class="chart-container">
        <svg
          viewBox={`0 0 ${width} ${height + (props.showLegend !== false ? 100 : 0)}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Arcs */}
          <For each={pie()}>
            {(arc) => (
              <g>
                <path
                  d={arc.arcPath}
                  fill={arc.data.color}
                  stroke="var(--bg-card)"
                  stroke-width="2"
                  opacity="0.9"
                >
                  <title>
                    {`${arc.data.label}: ${formatChartTooltip(arc.data.value)} (${(arc.data.value / total() * 100).toFixed(1)}%)`}
                  </title>
                </path>
              </g>
            )}
          </For>

          {/* Center label (total) */}
          <text
            x={cx}
            y={cy - 8}
            text-anchor="middle"
            fill="var(--text)"
            font-size="22"
            font-weight="700"
          >
            {formatChartTooltip(total())}
          </text>
          <text
            x={cx}
            y={cy + 14}
            text-anchor="middle"
            fill="var(--text-secondary)"
            font-size="12"
          >
            Total
          </text>

          {/* Legend (below chart) */}
          <Show when={props.showLegend !== false}>
            <g transform={`translate(${cx - Math.min(width * 0.4, 200)}, ${height + 10})`}>
              <For each={legendItems()}>
                {(item, i) => (
                  <g transform={`translate(${(i() % 2) * (Math.min(width * 0.4, 200) + 20)}, ${Math.floor(i() / 2) * 22})`}>
                    <rect
                      x={0}
                      y={-7}
                      width={10}
                      height={10}
                      rx={2}
                      fill={item.color}
                    />
                    <text
                      x={16}
                      y={2}
                      fill="var(--text-secondary)"
                      font-size="11"
                    >
                      {item.label}
                    </text>
                    <text
                      x={160}
                      y={2}
                      text-anchor="end"
                      fill="var(--text)"
                      font-size="11"
                    >
                      {(item.value / total() * 100).toFixed(1)}%
                    </text>
                  </g>
                )}
              </For>
            </g>
          </Show>
        </svg>
      </div>
    </Show>
  );
}

function EmptyChart() {
  return (
    <div class="chart-empty" style={{
      height: "200px",
      display: "flex",
      "align-items": "center",
      "justify-content": "center",
      color: "var(--text-muted)",
      "font-size": "0.9rem",
    }}>
      No spending data for this period
    </div>
  );
}
