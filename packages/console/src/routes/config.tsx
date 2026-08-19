import { For, createEffect, createResource, createSignal } from "solid-js";
import { apiGet, apiPatch } from "../lib/api";
import { editableVars, hiddenSensitiveVarNames } from "../lib/config-vars";
import { ConfigResponseSchema, type ShedflareConfig } from "../api/types";

function appVars(config: ShedflareConfig, appId: string): Record<string, string> | undefined {
  return config.configVersion === 1 ? config.vars[appId] : config.apps[appId]?.vars;
}

function isAppEnabled(config: ShedflareConfig, appId: string): boolean {
  if (config.configVersion === 1) {
    const selection = config.apps[appId];
    return !!selection && selection.enabled !== false;
  }
  return !!config.apps[appId];
}

function varsToText(vars: Record<string, string> | undefined): string {
  return Object.entries(editableVars(vars))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

interface EnvVars {
  [name: string]: string;
}

function varsFromText(text: string): EnvVars {
  const vars: EnvVars = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator === -1) throw new Error(`Invalid var line "${line}". Use NAME=value.`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new Error(
        `Invalid var name "${key}". Use uppercase letters, numbers, and underscores.`,
      );
    }
    vars[key] = value;
  }
  return vars;
}

export default function ConfigPage() {
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal<string | null>(null);
  const [configRes, { refetch }] = createResource(() =>
    apiGet("/api/config", ConfigResponseSchema),
  );

  const [domain, setDomain] = createSignal("");
  const [ownerEmail, setOwnerEmail] = createSignal("");
  const [subdomains, setSubdomains] = createSignal<Record<string, string>>({});
  const [varText, setVarText] = createSignal<Record<string, string>>({});

  createEffect(() => {
    const c = configRes()?.config;
    if (!c) return;
    setDomain(c.domain);
    setOwnerEmail(c.ownerEmail);
    setSubdomains(
      Object.fromEntries(Object.entries(c.apps).map(([id, entry]) => [id, entry.subdomain ?? ""])),
    );
    setVarText(
      Object.fromEntries(Object.keys(c.apps).map((id) => [id, varsToText(appVars(c, id))])),
    );
  });

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

  const saveSubdomain = async (appId: string) => {
    setSaving(true);
    setMessage(null);
    try {
      await apiPatch("/api/config", {
        apps: { [appId]: { subdomain: subdomains()[appId] || null } },
      });
      setMessage(`Saved ${appId} subdomain.`);
      await refetch();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  };

  const removeApp = async (appId: string) => {
    setSaving(true);
    setMessage(null);
    try {
      await apiPatch("/api/config", { apps: { [appId]: null } });
      setMessage(`Removed ${appId} from the selected apps.`);
      await refetch();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveVars = async (appId: string) => {
    setSaving(true);
    setMessage(null);
    try {
      await apiPatch("/api/config", {
        apps: { [appId]: { vars: varsFromText(varText()[appId] ?? "") } },
      });
      setMessage(`Saved ${appId} vars.`);
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
                value={domain()}
                onInput={(e) => setDomain(e.currentTarget.value)}
              />
            </div>
            <div class="field">
              <label for="ownerEmail">Owner email</label>
              <input
                id="ownerEmail"
                value={ownerEmail()}
                onInput={(e) => setOwnerEmail(e.currentTarget.value)}
              />
            </div>
            <button class="btn btn-primary" disabled={saving()} onClick={saveTopLevel}>
              {saving() ? "Saving…" : "Save"}
            </button>
          </div>

          <h2 style={{ "font-size": "16px", margin: "28px 0 12px" }}>Apps</h2>
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
                      <td>
                        <input
                          class="table-input"
                          value={subdomains()[id] ?? entry.subdomain ?? ""}
                          onInput={(e) =>
                            setSubdomains((current) => ({
                              ...current,
                              [id]: e.currentTarget.value,
                            }))
                          }
                        />
                      </td>
                      <td>{isAppEnabled(configRes()!.config!, id) ? "Yes" : "No"}</td>
                      <td>
                        <div class="row-actions">
                          <button
                            class="btn btn-ghost btn-sm"
                            disabled={saving()}
                            onClick={() => saveSubdomain(id)}
                          >
                            Save
                          </button>
                          {configRes()!.config!.configVersion === 2 && (
                            <button
                              class="btn btn-ghost btn-sm"
                              disabled={saving()}
                              onClick={() => removeApp(id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          <h2 style={{ "font-size": "16px", margin: "28px 0 12px" }}>Per-app vars</h2>
          <p class="footnote" style={{ "margin-bottom": "12px" }}>
            One non-secret KEY=value pair per line. Secret-looking keys are hidden and left
            unchanged.
          </p>
          <div class="vars-grid">
            <For each={Object.keys(configRes()!.config!.apps)}>
              {(id) => {
                const hiddenVars = () => hiddenSensitiveVarNames(appVars(configRes()!.config!, id));
                return (
                  <section class="vars-panel">
                    <div class="vars-panel-header">
                      <h3>{id}</h3>
                      <button
                        class="btn btn-ghost btn-sm"
                        disabled={saving()}
                        onClick={() => saveVars(id)}
                      >
                        Save vars
                      </button>
                    </div>
                    {hiddenVars().length > 0 && (
                      <p class="vars-redacted">Hidden sensitive keys: {hiddenVars().join(", ")}</p>
                    )}
                    <textarea
                      class="vars-textarea"
                      spellcheck={false}
                      value={varText()[id] ?? ""}
                      onInput={(e) =>
                        setVarText((current) => ({
                          ...current,
                          [id]: e.currentTarget.value,
                        }))
                      }
                    />
                  </section>
                );
              }}
            </For>
          </div>
        </>
      )}
    </div>
  );
}
