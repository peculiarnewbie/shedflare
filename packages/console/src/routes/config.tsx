import { For, createResource, createSignal } from "solid-js";
import { apiGet, apiPatch } from "../lib/api";
import type { ShedflareConfig } from "../api/types";

export default function ConfigPage() {
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal<string | null>(null);
  const [configRes, { refetch }] = createResource(() =>
    apiGet<{ config: ShedflareConfig | null; configPath: string }>("/api/config"),
  );

  const [domain, setDomain] = createSignal("");
  const [ownerEmail, setOwnerEmail] = createSignal("");

  const syncFields = () => {
    const c = configRes()?.config;
    if (!c) return;
    setDomain(c.domain);
    setOwnerEmail(c.ownerEmail);
  };

  const saveTopLevel = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await apiPatch("/api/config", {
        domain: domain(),
        ownerEmail: ownerEmail(),
      });
      setMessage("Saved.");
      await refetch();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleApp = async (appId: string, enabled: boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      await apiPatch("/api/config", {
        apps: { [appId]: { enabled } },
      });
      setMessage(`Updated ${appId}.`);
      await refetch();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div class="page-header">
        <div>
          <h1>Config</h1>
          <p class="page-subtitle">Edit shedflare.config.jsonc from your local workspace.</p>
        </div>
      </div>

      {configRes.error && <div class="error-banner">{String(configRes.error)}</div>}
      {message() && <div class="info-banner">{message()}</div>}

      {configRes() && !configRes()!.config && (
        <div class="error-banner">
          No config file found. Copy shedflare.config.example.jsonc to shedflare.config.jsonc.
        </div>
      )}

      {configRes()?.config && (
        <>
          <div class="config-form">
            <div class="field">
              <label for="domain">Domain</label>
              <input
                id="domain"
                value={domain() || configRes()!.config!.domain}
                onInput={(e) => {
                  syncFields();
                  setDomain(e.currentTarget.value);
                }}
                onFocus={syncFields}
              />
            </div>
            <div class="field">
              <label for="ownerEmail">Owner email</label>
              <input
                id="ownerEmail"
                value={ownerEmail() || configRes()!.config!.ownerEmail}
                onInput={(e) => {
                  syncFields();
                  setOwnerEmail(e.currentTarget.value);
                }}
                onFocus={syncFields}
              />
            </div>
            <button class="btn btn-primary" disabled={saving()} onClick={saveTopLevel}>
              {saving() ? "Saving…" : "Save"}
            </button>
          </div>

          <h2 style={{ "font-size": "16px", "margin": "28px 0 12px" }}>Apps</h2>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>App</th>
                  <th>Subdomain</th>
                  <th>Enabled</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <For each={Object.entries(configRes()!.config!.apps)}>
                  {([id, entry]) => (
                    <tr>
                      <td style={{ "font-family": "var(--font-mono)" }}>{id}</td>
                      <td>{entry.subdomain}</td>
                      <td>{entry.enabled === false ? "No" : "Yes"}</td>
                      <td>
                        <button
                          class="btn btn-ghost btn-sm"
                          disabled={saving()}
                          onClick={() => toggleApp(id, entry.enabled === false)}
                        >
                          {entry.enabled === false ? "Enable" : "Disable"}
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          <h2 style={{ "font-size": "16px", "margin": "28px 0 12px" }}>Per-app vars</h2>
          <p class="footnote" style={{ "margin-bottom": "12px" }}>
            Read-only view. Full var editing can be added next — edit shedflare.config.jsonc directly for now.
          </p>
          <pre
            class="deploy-output"
            style={{ "max-height": "240px" }}
          >{JSON.stringify(configRes()!.config!.vars ?? {}, null, 2)}</pre>
        </>
      )}
    </div>
  );
}
