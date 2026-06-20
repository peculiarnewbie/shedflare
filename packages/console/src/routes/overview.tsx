import { For, createResource } from "solid-js";
import { apiGet } from "../lib/api";
import type { SuiteOverview } from "../api/types";
import AppCard from "../components/AppCard";

export default function Overview() {
  const [overview, { refetch }] = createResource(() => apiGet<SuiteOverview>("/api/overview"));

  return (
    <div>
      <div class="page-header">
        <div>
          <h1>Overview</h1>
          <p class="page-subtitle">Shedflare suite status from your local workspace and Cloudflare account.</p>
        </div>
        <button class="btn btn-ghost btn-sm" onClick={() => refetch()}>
          Refresh
        </button>
      </div>

      {overview.error && <div class="error-banner">{String(overview.error)}</div>}

      {overview() && !overview()!.cfTokenValid && (
        <div class="error-banner">
          Cloudflare API token is missing or invalid. Set CF_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in your
          environment.
        </div>
      )}

      {overview() && !overview()!.configPresent && (
        <div class="info-banner">
          shedflare.config.jsonc not found. Run <code>shedflare init</code> or copy from
          shedflare.config.example.jsonc.
        </div>
      )}

      {overview() && (
        <>
          <div class="stat-grid">
            <div class="stat-card">
              <div class="stat-label">Domain</div>
              <div class="stat-value">{overview()!.domain ?? "—"}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Deploy stage</div>
              <div class="stat-value">{overview()!.deployStage}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Apps</div>
              <div class="stat-value">{overview()!.apps.filter((a) => a.enabled).length}</div>
              <div class="stat-meta">
                {overview()!.apps.filter((a) => a.workerDeployed).length} workers on CF
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Account</div>
              <div class="stat-value" style={{ "font-size": "13px", "font-family": "var(--font-mono)" }}>
                {overview()!.accountId.slice(0, 8)}…
              </div>
            </div>
          </div>

          <h2 style={{ "font-size": "14px", "margin-bottom": "10px", color: "var(--text-secondary)" }}>
            Cloudflare dashboard
          </h2>
          <div class="link-grid">
            <For each={Object.entries(overview()!.dashboardLinks)}>
              {([label, url]) => (
                <a class="link-chip" href={url} target="_blank" rel="noreferrer">
                  {label} ↗
                </a>
              )}
            </For>
          </div>

          <h2 style={{ "font-size": "14px", "margin-bottom": "10px", color: "var(--text-secondary)" }}>
            Apps
          </h2>
          <div class="app-grid">
            <For each={overview()!.apps}>
              {(app) => <AppCard app={app} />}
            </For>
          </div>
        </>
      )}

      {overview.loading && <div class="empty-state">Loading suite overview…</div>}
    </div>
  );
}
