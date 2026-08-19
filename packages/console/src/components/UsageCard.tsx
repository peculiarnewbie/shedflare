import type { ProductUsage } from "../api/types";
import MetricBar from "./MetricBar";

const ICONS = new Map([
  ["workers", "⚡"],
  ["kv", "🗂"],
  ["d1", "🗄"],
  ["durableObjects", "⚙"],
  ["r2", "📦"],
  ["http", "🌐"],
]);

export default function UsageCard(props: { product: ProductUsage }) {
  return (
    <div class="usage-card">
      <div class="usage-card-header">
        <span>{ICONS.get(props.product.id) ?? "📊"}</span>
        <h2 class="usage-card-name">{props.product.name}</h2>
      </div>
      <div class="usage-card-metrics">
        {props.product.metrics.map((metric) => (
          <MetricBar metric={metric} />
        ))}
      </div>
    </div>
  );
}
