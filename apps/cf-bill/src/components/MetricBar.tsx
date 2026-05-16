import type { UsageMetric } from "../api/types";

interface Props {
  metric: UsageMetric;
}

function pct(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min((used / limit) * 100, 100);
}

function formatLimit(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function MetricBar(props: Props) {
  const m = props.metric;
  const freePct = pct(m.used, m.limits.free);
  const paidPct = pct(m.used, m.limits.paid);

  return (
    <div class="metric-row">
      <div class="metric-label">
        <span class="metric-label-text">{m.label}</span>
        <span class="metric-value">{m.unit}</span>
      </div>
      <div class="metric-bars">
        <div class="metric-bar-group">
          <span class="metric-bar-label">Free</span>
          <div class="metric-bar-track">
            <div class="metric-bar-fill free" style={{ width: `${freePct}%` }} />
          </div>
          <span class="metric-bar-limit">{formatLimit(m.limits.free)}</span>
        </div>
        <div class="metric-bar-group">
          <span class="metric-bar-label">Paid</span>
          <div class="metric-bar-track">
            <div class="metric-bar-fill paid" style={{ width: `${paidPct}%` }} />
          </div>
          <span class="metric-bar-limit">{formatLimit(m.limits.paid)}</span>
        </div>
      </div>
      {m.limits.label && <div class="metric-note">Compared against {m.limits.label}.</div>}
      {m.note && <div class="metric-note">{m.note}</div>}
    </div>
  );
}
