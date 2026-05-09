/**
 * Tags page — create and manage tags for transaction categorization.
 */
import { createSignal, For, Show, createEffect } from "solid-js";
import { dispatch } from "../lib/pending-ops";

export default function TagsPage() {
  const [tags, setTags] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [newName, setNewName] = createSignal("");
  const [newColor, setNewColor] = createSignal("#4f46e5");

  createEffect(() => {
    void loadTags();
  });

  async function loadTags() {
    try {
      const res = await fetch("/api/tags");
      if (res.ok) {
        const data = (await res.json()) as any;
        setTags(data.tags ?? []);
      }
    } catch {
      // Will work once sync is connected
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    const name = newName().trim();
    if (!name) return;
    dispatch("create_tag", { name, color: newColor() });
    setNewName("");
  }

  function handleDelete(id: string) {
    dispatch("delete_tag", { id });
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

      <Show when={!loading()} fallback={<div class="loading">Loading tags...</div>}>
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
      </Show>
    </div>
  );
}
