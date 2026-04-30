import { For, Show, createSignal } from "solid-js";

type ArchivedThreadInfo = {
  id: string;
  title: string;
  workspaceName: string;
  archivedAt: string;
};

type SettingsPageProps = {
  workspaceName: string | undefined;
  systemPromptDraft: string;
  onSystemPromptInput: (value: string) => void;
  onBack: () => void;
  onCancel: () => void;
  onSave: () => void;
  expandReasoningByDefault: boolean;
  onExpandReasoningChange: (checked: boolean) => void;
  preferFreeSearch: boolean;
  onPreferFreeSearchChange: (checked: boolean) => void;
  exaApiKeyConfigured: boolean;
  showTraces: boolean;
  onShowTracesChange: (checked: boolean) => void;
  onResetAllData: () => void;
  models: Array<{ id: string; name: string }>;
  titleGenerationModelId: string | null;
  onTitleGenerationModelChange: (modelId: string | null) => void;
  archivedThreads: ArchivedThreadInfo[];
  onDeleteThreadPermanently: (threadId: string) => void;
};

export default function SettingsPage(props: SettingsPageProps) {
  const [activeTab, setActiveTab] = createSignal<"general" | "archived">("general");

  return (
    <div class="settings-page">
      <header class="settings-header">
        <button class="btn" onClick={props.onBack}>
          ← Back
        </button>
        <h2>Settings</h2>
        <span class="settings-workspace">{props.workspaceName}</span>
      </header>

      <div class="settings-tabs">
        <button
          class="settings-tab"
          classList={{ active: activeTab() === "general" }}
          onClick={() => setActiveTab("general")}
        >
          General
        </button>
        <button
          class="settings-tab"
          classList={{ active: activeTab() === "archived" }}
          onClick={() => setActiveTab("archived")}
        >
          Archived Threads
          <Show when={props.archivedThreads.length > 0}>
            <span class="settings-tab-badge">{props.archivedThreads.length}</span>
          </Show>
        </button>
      </div>

      <Show when={activeTab() === "general"}>
        <div class="settings-body">
          <div class="settings-section">
            <label class="settings-label">Account</label>
            <p class="settings-hint">Preferences that apply across all workspaces.</p>
            <label class="settings-label" for="title-generation-model">
              Title generation model
            </label>
            <select
              id="title-generation-model"
              class="settings-select"
              value={props.titleGenerationModelId ?? ""}
              onChange={(e) => props.onTitleGenerationModelChange(e.currentTarget.value || null)}
            >
              <option value="">Use chat model</option>
              {props.models.map((model) => (
                <option value={model.id}>{model.name}</option>
              ))}
            </select>
          </div>

          <div class="settings-section">
            <label class="settings-toggle">
              <input
                type="checkbox"
                checked={props.expandReasoningByDefault}
                onChange={(e) => props.onExpandReasoningChange(e.currentTarget.checked)}
              />
              <span class="settings-label">Expand reasoning by default</span>
            </label>
            <p class="settings-hint">
              Keep the reasoning chip open after a response finishes, instead of auto-collapsing it.
            </p>
          </div>

          <div class="settings-section">
            <label class="settings-toggle">
              <input
                type="checkbox"
                checked={props.showTraces}
                onChange={(e) => props.onShowTracesChange(e.currentTarget.checked)}
              />
              <span class="settings-label">Show traces</span>
            </label>
            <p class="settings-hint">Show detailed trace drawers under assistant responses.</p>
          </div>

          <div class="settings-section">
            <label class="settings-label">Workspace</label>
            <p class="settings-hint">Preferences for this workspace only.</p>
            <label class="settings-label">System Prompt</label>
            <p class="settings-hint">
              Instructions prepended to every conversation in this workspace.
            </p>
            <textarea
              class="settings-textarea"
              value={props.systemPromptDraft}
              onInput={(e) => props.onSystemPromptInput(e.currentTarget.value)}
              placeholder="You are a helpful assistant..."
              rows={8}
            />
          </div>
          <div class="settings-actions">
            <button class="btn" onClick={props.onCancel}>
              Cancel
            </button>
            <button class="btn btn-primary" onClick={props.onSave}>
              Save
            </button>
          </div>

          <div class="settings-section">
            <label
              class="settings-toggle"
              classList={{ "settings-toggle--disabled": !props.exaApiKeyConfigured }}
            >
              <input
                type="checkbox"
                checked={props.preferFreeSearch}
                disabled={!props.exaApiKeyConfigured}
                onChange={(e) => props.onPreferFreeSearchChange(e.currentTarget.checked)}
              />
              <span class="settings-label">Use free web search</span>
            </label>
            <Show
              when={props.exaApiKeyConfigured}
              fallback={
                <p class="settings-hint settings-hint--warning">
                  No Exa API key configured. Set <code>EXA_API_KEY</code> as a Worker secret to
                  enable the paid search API with ranked results. Web search is using the free
                  public endpoint in the meantime.
                </p>
              }
            >
              <p class="settings-hint">
                Route web searches through Exa&apos;s public MCP endpoint instead of the paid API.
                Slower and returns raw text instead of ranked results, but avoids usage on your Exa
                API key.
              </p>
            </Show>
          </div>

          <div class="settings-section settings-danger">
            <label class="settings-label">Danger Zone</label>
            <p class="settings-hint">
              Wipe all data on server and locally. Start completely fresh.
            </p>
            <button class="btn btn-danger" onClick={props.onResetAllData}>
              Reset All Data
            </button>
          </div>
        </div>
      </Show>

      <Show when={activeTab() === "archived"}>
        <div class="settings-body">
          <Show
            when={props.archivedThreads.length > 0}
            fallback={
              <div class="settings-empty">
                <p>No archived threads.</p>
                <p class="settings-hint">
                  When you click the × button on a thread in the sidebar, it gets archived here. You
                  can permanently delete it from this page.
                </p>
              </div>
            }
          >
            <div class="archived-threads-list">
              <For each={props.archivedThreads}>
                {(thread) => (
                  <div class="archived-thread-row">
                    <div class="archived-thread-info">
                      <span class="archived-thread-title">{thread.title}</span>
                      <span class="archived-thread-meta">
                        {thread.workspaceName} · Archived{" "}
                        {new Date(thread.archivedAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <button
                      class="btn btn-danger btn-sm"
                      onClick={() => {
                        if (
                          confirm(
                            `Permanently delete "${thread.title}" and all its messages? This cannot be undone.`,
                          )
                        ) {
                          props.onDeleteThreadPermanently(thread.id);
                        }
                      }}
                    >
                      Delete permanently
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
