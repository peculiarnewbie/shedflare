import { useParams, A } from "@solidjs/router";
import { For, Show, createResource } from "solid-js";
import { apiGet } from "../lib/api";
import { SuiteOverviewSchema } from "../api/types";
import { useStage } from "../lib/stage-context";

export default function AppDetail() {
  const params = useParams();
  const { selectedStage } = useStage();

  const [overview] = createResource(
    () => selectedStage(),
    async (stage) => {
      const params = stage ? `?stage=${encodeURIComponent(stage)}` : "";
      return apiGet(`/api/overview${params}`, SuiteOverviewSchema);
    },
  );
  const app = () => overview()?.apps.find((a) => a.id === params.id) ?? null;
  const appName = () => app()?.manifest?.name ?? params.id;
  const loadedApp = () => {
    if (overview.loading || overview.error) return null;
    return app();
  };

  return (
    <div>
      <div class="page-header">
        <div>
          <A href="/apps" style={{ "font-size": "12px", color: "var(--text-muted)" }}>
            ← Apps
          </A>
          <h1>{appName()}</h1>
          <p class="page-subtitle">{app()?.manifest?.description}</p>
        </div>
      </div>

      <Show when={overview.error}>
        {(error) => <div class="error-banner">{String(error())}</div>}
      </Show>

      <Show when={overview.loading}>
        <div class="empty-state">Loading app details…</div>
      </Show>

      <Show when={!overview.loading && !overview.error && !loadedApp()}>
        <div class="empty-state">App not found.</div>
      </Show>

      <Show when={loadedApp()}>
        {(a) => (
          <>
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-label">Worker</div>
                <div
                  class="stat-value"
                  style={{ "font-size": "13px", "font-family": "var(--font-mono)" }}
                >
                  {a().workerName}
                </div>
                <div class="stat-meta">{a().workerDeployed ? "On Cloudflare" : "Not found"}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Subdomain</div>
                <div class="stat-value">{a().subdomain}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Resources</div>
                <div class="stat-value">{a().manifest?.resourceTypes.length ?? 0}</div>
                <div class="stat-meta">
                  {(a().manifest?.resourceTypes ?? []).join(", ") || "none"}
                </div>
              </div>
            </div>

            <div class="app-card-actions" style={{ "margin-bottom": "20px" }}>
              <a
                href={a().dashboardUrl}
                target="_blank"
                rel="noreferrer"
                class="btn btn-ghost btn-sm"
              >
                Open in CF dashboard ↗
              </a>
              <Show when={a().url}>
                {(url) => (
                  <a href={url()} target="_blank" rel="noreferrer" class="btn btn-ghost btn-sm">
                    Open app ↗
                  </a>
                )}
              </Show>
            </div>

            <h2
              style={{
                "font-size": "14px",
                "margin-bottom": "10px",
                color: "var(--text-secondary)",
              }}
            >
              Secrets
            </h2>
            <div class="table-wrap" style={{ "margin-bottom": "20px" }}>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <For
                    each={a().secrets}
                    fallback={
                      <tr>
                        <td colSpan={2}>No secrets declared in manifest.</td>
                      </tr>
                    }
                  >
                    {(secret) => (
                      <tr>
                        <td style={{ "font-family": "var(--font-mono)" }}>{secret.name}</td>
                        <td>
                          {secret.set ? (
                            <span class="badge badge-ok">Set</span>
                          ) : (
                            <span class="badge badge-warn">Missing</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>

            <p class="footnote">
              Set secrets with <code>shedflare secret set {a().id} NAME</code> from the repo root.
            </p>
          </>
        )}
      </Show>
    </div>
  );
}
