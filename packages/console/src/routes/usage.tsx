import { For, createResource, createSignal } from "solid-js";
import { apiGet } from "../lib/api";
import type { BillableUsageRecord, UsageResponse } from "../api/types";
import UsageCard from "../components/UsageCard";

export default function Usage() {
  const [refreshing, setRefreshing] = createSignal(false);
  const [usage, { refetch: refetchUsage }] = createResource(() => apiGet<UsageResponse>("/api/usage"));
  const [billable, { refetch: refetchBillable }] = createResource(() =>
    apiGet<{ records: BillableUsageRecord[]; error?: string }>("/api/billable-usage"),
  );

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchUsage(), refetchBillable()]);
    setRefreshing(false);
  };

  return (
    <div>
      <div class="page-header">
        <div>
          <h1>Usage</h1>
          {usage()?.period && (
            <p class="page-subtitle">
              {new Date(usage()!.period.start).toLocaleDateString()} –{" "}
              {new Date(usage()!.period.end).toLocaleDateString()} (current month, UTC)
            </p>
          )}
        </div>
        <button class="btn btn-ghost btn-sm" disabled={refreshing()} onClick={refresh}>
          {refreshing() ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {usage.error && <div class="error-banner">{String(usage.error)}</div>}

      {usage()?.queryErrors.length ? (
        <div class="info-banner">
          Partial data — some queries failed:
          <ul style={{ "margin-top": "6px", "padding-left": "18px" }}>
            <For each={usage()!.queryErrors}>{(e) => <li>{e}</li>}</For>
          </ul>
        </div>
      ) : null}

      {usage() && (
        <div class="products-grid">
          <For each={usage()!.products}>{(product) => <UsageCard product={product} />}</For>
        </div>
      )}

      {usage() && usage()!.products.length === 0 && !usage.error && (
        <div class="empty-state">No usage data returned for this period.</div>
      )}

      <h2 style={{ "font-size": "16px", "margin": "28px 0 12px" }}>Billable usage (API)</h2>
      {billable()?.error && (
        <div class="info-banner">
          Billable usage API unavailable: {billable()!.error}. This endpoint is alpha/restricted on some
          accounts.
        </div>
      )}

      {billable()?.records.length ? (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Metric</th>
                <th>Quantity</th>
                <th>Period</th>
              </tr>
            </thead>
            <tbody>
              <For each={billable()!.records.slice(0, 50)}>
                {(row) => (
                  <tr>
                    <td>{row.x_ProductFamilyName ?? "—"}</td>
                    <td>{row.x_BillableMetricName ?? row.x_BillableMetricId ?? "—"}</td>
                    <td>
                      {row.ConsumedQuantity.toLocaleString()} {row.ConsumedUnit}
                    </td>
                    <td style={{ "font-size": "12px", color: "var(--text-muted)" }}>
                      {row.ChargePeriodStart.slice(0, 10)}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      ) : (
        !billable.loading && <div class="empty-state">No billable usage records.</div>
      )}

      <p class="footnote">
        GraphQL figures are analytics estimates. Billable usage comes from Cloudflare&apos;s FOCUS-aligned API
        when available.
      </p>

      {usage.loading && <div class="empty-state">Loading usage…</div>}
    </div>
  );
}
