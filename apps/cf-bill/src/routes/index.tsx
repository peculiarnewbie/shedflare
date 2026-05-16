import { createSignal, onMount } from "solid-js";
import UsageCard from "../components/UsageCard";
import type { UsageResponse } from "../api/types";

async function fetchUsage(): Promise<UsageResponse> {
  const res = await fetch("/api/usage");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
      error?: string;
    };
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}

export default function Dashboard() {
  const [data, setData] = createSignal<UsageResponse | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [refreshing, setRefreshing] = createSignal(false);

  const load = async () => {
    try {
      setError(null);
      const d = await fetchUsage();
      setData(d);
    } catch (e) {
      setError(String(e));
    }
  };

  onMount(() => {
    void load();
  });

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const period = () => data()?.period;
  const products = () => data()?.products ?? [];

  return (
    <div>
      <div class="page-header">
        <div>
          <h1>Usage Monitor</h1>
          {period() && (
            <p class="period-label">
              {new Date(period()!.start).toLocaleDateString()} –{" "}
              {new Date(period()!.end).toLocaleDateString()}
            </p>
          )}
        </div>
        <button class="btn btn-ghost btn-sm" onClick={refresh} disabled={refreshing()}>
          {refreshing() ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error() && <div class="error-banner">{error()}</div>}

      <div class="products-grid">
        {products().map((product) => (
          <UsageCard product={product} />
        ))}
      </div>

      {!data() && !error() && (
        <div class="empty-state">
          <div class="empty-state-title">Loading usage data...</div>
          <div class="empty-state-desc">
            Fetching Cloudflare usage estimates from GraphQL Analytics.
          </div>
        </div>
      )}

      {data() && products().length === 0 && !error() && (
        <div class="empty-state">
          <div class="empty-state-title">No usage data</div>
          <div class="empty-state-desc">
            No products reported usage for this period. Check your Cloudflare API token and
            account/zone IDs.
          </div>
        </div>
      )}

      <p class="footnote">
        Cloudflare GraphQL Analytics provides aggregated usage estimates, not billing-grade
        metering. Billable usage can exclude traffic that analytics includes.
      </p>
    </div>
  );
}
