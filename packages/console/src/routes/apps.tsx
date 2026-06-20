import { For, createResource } from "solid-js";
import { apiGet } from "../lib/api";
import type { SuiteOverview } from "../api/types";
import AppCard from "../components/AppCard";

export default function Apps() {
  const [overview, { refetch }] = createResource(() => apiGet<SuiteOverview>("/api/overview"));

  return (
    <div>
      <div class="page-header">
        <div>
          <h1>Apps</h1>
          <p class="page-subtitle">Discovered from apps/*/shedflare.app.jsonc and matched to deployed Workers.</p>
        </div>
        <button class="btn btn-ghost btn-sm" onClick={() => refetch()}>
          Refresh
        </button>
      </div>

      {overview.error && <div class="error-banner">{String(overview.error)}</div>}

      {overview() && (
        <div class="app-grid">
          <For each={overview()!.apps}>
            {(app) => <AppCard app={app} />}
          </For>
        </div>
      )}

      {overview.loading && <div class="empty-state">Loading apps…</div>}
    </div>
  );
}
