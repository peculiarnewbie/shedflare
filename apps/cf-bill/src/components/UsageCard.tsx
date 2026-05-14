import type { ProductUsage } from "../api/types";
import MetricBar from "./MetricBar";

interface Props {
  product: ProductUsage;
}

const PRODUCT_ICONS: Record<string, string> = {
  workers: "⚡",
  kv: "🗂",
  d1: "🗄",
  durableObjects: "⚙",
  r2: "📦",
  http: "🌐",
};

export default function UsageCard(props: Props) {
  const icon = PRODUCT_ICONS[props.product.id] ?? "📊";

  return (
    <div class="usage-card">
      <div class="usage-card-header">
        <span class="usage-card-icon">{icon}</span>
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
