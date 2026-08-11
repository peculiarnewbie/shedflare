/**
 * Tags page — create and manage tags for transaction categorization.
 */
import { createSignal, For, Show, createEffect, onCleanup, onMount } from "solid-js";
import { dispatch } from "../lib/pending-ops";
import { api } from "../lib/api";
import { PageState } from "../components/PageState";
import { listenForMoneyDataChanged } from "../lib/data-events";

export default function TagsPage() {
  const [tags, setTags] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [newName, setNewName] = createSignal("");
  const [newColor, setNewColor] = createSignal("#4f46e5");

  createEffect(() => {
    void loadTags();
  });

  onMount(() => {
    onCleanup(listenForMoneyDataChanged(loadTags));
  });

  async function loadTags() {
    setError(null);
    try {
      const data = await api.tags();
      setTags([...data.tags]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tags");
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    const name = newName().trim();
    if (!name) return;
    dispatch(
      "create_tag",
      { name, color: newColor() },
      {
        undoInfo: {
          label: "Create tag",
          inverse: (data) => ({ commandType: "delete_tag", payload: { id: data.id as string } }),
        },
      },
    );
    setNewName("");
  }

  function handleDelete(id: string) {
    const tag = tags().find((t) => t.id === id);
    dispatch(
      "delete_tag",
      { id },
      {
        undoInfo: {
          label: "Delete tag",
          inverse: {
            commandType: "create_tag",
            payload: { name: tag?.name ?? "", color: tag?.color ?? "#4f46e5" },
          },
        },
      },
    );
    setTags((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div class="page">
      <h1 class="page-title">Tags</h1>
      <p class="page-subtitle">Additional categorization for transactions</p>

      <div class="inline-form">
        <input
          type="text"
          placeholder="Tag name..."
          value={newName()}
          onInput={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <input
          type="color"
          value={newColor()}
          onChange={(e) => setNewColor(e.currentTarget.value)}
          style="width:40px;height:40px;padding:2px;border-radius:6px"
        />
        <button class="btn btn-primary btn-sm" onClick={handleCreate} disabled={!newName().trim()}>
          Add Tag
        </button>
      </div>

      <PageState
        loading={loading()}
        error={error()}
        onRetry={loadTags}
        loadingMessage="Loading tags..."
      >
        <Show
          when={tags().length > 0}
          fallback={<div class="empty-state">No tags yet. Create one above.</div>}
        >
          <div class="tag-list">
            <For each={tags()}>
              {(tag) => (
                <div class="tag-chip">
                  <span class="tag-dot" style={{ "background-color": tag.color ?? "#4f46e5" }} />
                  <span class="tag-name">{tag.name}</span>
                  <button
                    class="btn btn-icon btn-ghost btn-xs"
                    onClick={() => handleDelete(tag.id)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </PageState>
    </div>
  );
}
