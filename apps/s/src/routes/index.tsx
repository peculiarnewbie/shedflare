import { createEffect, createSignal, For, Show } from "solid-js";
import { fetchLinks, createLink, deleteLink } from "../api";

type Link = { slug: string; url: string; hidePreview: boolean; createdAt: string };

export default function Dashboard() {
  const [links, setLinks] = createSignal<Link[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [slug, setSlug] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [hidePreview, setHidePreview] = createSignal(false);
  const [error, setError] = createSignal("");
  const [success, setSuccess] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [toast, setToast] = createSignal("");

  let toastTimer: ReturnType<typeof setTimeout>;

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(""), 2000);
  }

  async function load() {
    try {
      const data = await fetchLinks();
      setLinks(data.links);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    void load();
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const s = slug().trim().toLowerCase();
    const u = url().trim();

    if (!s || !u) {
      setError("Both fields are required.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createLink(s, u, hidePreview());
      if ("error" in result) {
        setError(result.error);
      } else {
        setSuccess(`Created ${s}`);
        setSlug("");
        setUrl("");
        setHidePreview(false);
        void load();
      }
    } catch {
      setError("Failed to create link.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(s: string) {
    try {
      await deleteLink(s);
      setLinks((prev) => prev.filter((l) => l.slug !== s));
      showToast(`Deleted ${s}`);
    } catch {
      showToast("Failed to delete");
    }
  }

  function handleCopy(slug: string) {
    const base = window.location.origin;
    void navigator.clipboard.writeText(`${base}/${slug}`);
    showToast("Copied to clipboard");
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  return (
    <>
      <form class="create-form" onSubmit={handleSubmit}>
        <div class="create-form-title">New Link</div>
        <div class="create-form-row">
          <div class="input-group">
            <label for="slug">Slug</label>
            <input
              id="slug"
              class="input-slug"
              type="text"
              placeholder="my-link"
              value={slug()}
              onInput={(e) => setSlug(e.currentTarget.value)}
            />
          </div>
          <div class="input-group" style={{ flex: 2 }}>
            <label for="url">Destination URL</label>
            <input
              id="url"
              type="url"
              placeholder="https://example.com"
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
            />
          </div>
          <div class="input-group" style={{ flex: 0, "align-self": "flex-end" }}>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={hidePreview()}
                onChange={(e) => setHidePreview(e.currentTarget.checked)}
              />
              Hide preview
            </label>
          </div>
          <div class="input-group" style={{ "align-self": "flex-end" }}>
            <button type="submit" class="btn btn-primary" disabled={submitting()}>
              {submitting() ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
        <Show when={error()}>
          <div class="form-error">{error()}</div>
        </Show>
        <Show when={success()}>
          <div class="form-success">{success()}</div>
        </Show>
      </form>

      <Show when={!loading()} fallback={<div class="loading-spinner" />}>
        <div class="link-list-header">
          <span class="link-list-title">All Links</span>
          <span class="link-list-count">
            {links().length} {links().length === 1 ? "link" : "links"}
          </span>
        </div>

        <Show
          when={links().length > 0}
          fallback={
            <div class="empty-state">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <p>No links yet. Create one above.</p>
            </div>
          }
        >
          <table class="link-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Destination</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <For each={links()}>
                {(link) => (
                  <tr>
                    <td>
                      <span class="link-slug">
                        {link.slug}
                        {link.hidePreview && (
                          <span class="link-hidden-badge" title="Preview hidden">
                            Hidden
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span class="link-url">
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.url}
                        </a>
                      </span>
                    </td>
                    <td>
                      <span class="link-date">{formatDate(link.createdAt)}</span>
                    </td>
                    <td>
                      <div class="link-actions">
                        <button
                          class="btn-icon"
                          title="Copy short URL"
                          onClick={() => handleCopy(link.slug)}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </button>
                        <button
                          class="btn-icon"
                          title="Delete link"
                          onClick={() => handleDelete(link.slug)}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </Show>

      <Show when={toast()}>
        <div class="copy-toast">{toast()}</div>
      </Show>
    </>
  );
}
