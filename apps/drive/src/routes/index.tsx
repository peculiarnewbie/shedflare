import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  description: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
};

type TagSummary = { name: string; count: number };

const formatter = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${formatter.format(size / 1024)} KB`;
  if (size < 1024 * 1024 * 1024) return `${formatter.format(size / 1024 / 1024)} MB`;
  return `${formatter.format(size / 1024 / 1024 / 1024)} GB`;
}

function fileGlyph(file: DriveFile) {
  if (file.mimeType.startsWith("image/")) return "IMG";
  if (file.mimeType.includes("pdf")) return "PDF";
  if (file.mimeType.startsWith("video/")) return "VID";
  if (file.mimeType.startsWith("audio/")) return "AUD";
  if (file.mimeType.includes("zip") || file.mimeType.includes("tar")) return "ZIP";
  return "DOC";
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

export default function Home() {
  const [files, setFiles] = createSignal<DriveFile[]>([]);
  const [tags, setTags] = createSignal<TagSummary[]>([]);
  const [search, setSearch] = createSignal("");
  const [selectedTag, setSelectedTag] = createSignal("");
  const [uploadTags, setUploadTags] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [userEmail, setUserEmail] = createSignal("");

  const query = createMemo(() => {
    const params = new URLSearchParams();
    if (search().trim()) params.set("search", search().trim());
    if (selectedTag()) params.set("tag", selectedTag());
    return params.toString();
  });

  async function loadFiles() {
    const suffix = query() ? `?${query()}` : "";
    const data = await requestJson<{ files: DriveFile[] }>(`/api/files${suffix}`);
    setFiles(data.files);
  }

  async function loadTags() {
    const data = await requestJson<{ tags: TagSummary[] }>("/api/tags");
    setTags(data.tags);
  }

  async function bootstrap() {
    try {
      const session = await requestJson<{ user: { email: string } }>("/api/session");
      setUserEmail(session.user.email);
      await Promise.all([loadFiles(), loadTags()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Drive");
    }
  }

  createEffect(() => {
    void query();
    void loadFiles().catch((err) => setError(err instanceof Error ? err.message : "Search failed"));
  });

  void bootstrap();

  async function upload(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const input = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    const data = new FormData();
    data.set("file", file);
    data.set("description", description());
    data.set("tags", uploadTags());

    setBusy(true);
    setError("");
    try {
      await requestJson("/api/files", { method: "POST", body: data });
      form.reset();
      setUploadTags("");
      setDescription("");
      await Promise.all([loadFiles(), loadTags()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(file: DriveFile) {
    if (!confirm(`Delete ${file.name}?`)) return;
    setError("");
    try {
      await fetch(`/api/files/${file.id}`, { method: "DELETE" }).then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
      });
      await Promise.all([loadFiles(), loadTags()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <main class="drive-shell">
      <section class="hero">
        <div>
          <p class="eyebrow">Shedflare Drive</p>
          <h1>One private shelf for the files you actually need.</h1>
          <p class="hero-copy">
            No folders yet. Just tags, search, and a direct line to your R2 bucket.
          </p>
        </div>
        <Show when={userEmail()}>
          <div class="owner-card">
            <span>Owner</span>
            <strong>{userEmail()}</strong>
          </div>
        </Show>
      </section>

      <Show when={error()}>
        <div class="error-card">{error()}</div>
      </Show>

      <section class="control-panel">
        <form class="upload-card" onSubmit={upload}>
          <label class="file-drop">
            <input name="file" type="file" />
            <span>Drop a file into the shed</span>
          </label>
          <input
            value={uploadTags()}
            onInput={(event) => setUploadTags(event.currentTarget.value)}
            placeholder="tags: invoices, house, ideas"
          />
          <input
            value={description()}
            onInput={(event) => setDescription(event.currentTarget.value)}
            placeholder="short note"
          />
          <button disabled={busy()}>{busy() ? "Uploading..." : "Upload"}</button>
        </form>

        <div class="search-card">
          <input
            value={search()}
            onInput={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search names, notes, types, tags"
          />
          <div class="tag-strip">
            <button classList={{ active: selectedTag() === "" }} onClick={() => setSelectedTag("")}>
              All
            </button>
            <For each={tags()}>
              {(tag) => (
                <button
                  classList={{ active: selectedTag() === tag.name }}
                  onClick={() => setSelectedTag(tag.name)}
                >
                  {tag.name} <span>{tag.count}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </section>

      <section class="file-grid">
        <Show
          when={files().length > 0}
          fallback={<div class="empty">No files match this shelf.</div>}
        >
          <For each={files()}>
            {(file) => (
              <article class="file-card">
                <div class="file-mark">{fileGlyph(file)}</div>
                <div class="file-body">
                  <h2>{file.name}</h2>
                  <p>{file.description || file.mimeType}</p>
                  <div class="meta-row">
                    <span>{formatSize(file.size)}</span>
                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div class="file-tags">
                    <For each={file.tags}>{(tag) => <span>{tag}</span>}</For>
                  </div>
                </div>
                <div class="actions">
                  <a href={`/api/files/${file.id}/download`}>Download</a>
                  <button onClick={() => void remove(file)}>Delete</button>
                </div>
              </article>
            )}
          </For>
        </Show>
      </section>
    </main>
  );
}
