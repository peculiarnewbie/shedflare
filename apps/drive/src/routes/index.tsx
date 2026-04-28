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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeDriveFile(value: unknown): DriveFile | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.mimeType !== "string" ||
    typeof value.size !== "number" ||
    typeof value.description !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.tags) ||
    !value.tags.every((tag) => typeof tag === "string")
  ) {
    return null;
  }
  return value as DriveFile;
}

function decodeTagSummary(value: unknown): TagSummary | null {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.count !== "number")
    return null;
  return { name: value.name, count: value.count };
}

function decodeFilesResponse(
  value: unknown,
): { files: DriveFile[]; nextOffset: number | null } | null {
  if (!isRecord(value) || !Array.isArray(value.files)) return null;
  const files = value.files.map(decodeDriveFile);
  if (files.some((file) => !file)) return null;
  const nextOffset =
    value.nextOffset === null
      ? null
      : typeof value.nextOffset === "number"
        ? value.nextOffset
        : null;
  return { files: files as DriveFile[], nextOffset };
}

function decodeFileResponse(value: unknown): { file: DriveFile } | null {
  if (!isRecord(value)) return null;
  const file = decodeDriveFile(value.file);
  return file ? { file } : null;
}

function decodeTagsResponse(value: unknown): { tags: TagSummary[] } | null {
  if (!isRecord(value) || !Array.isArray(value.tags)) return null;
  const tags = value.tags.map(decodeTagSummary);
  if (tags.some((tag) => !tag)) return null;
  return { tags: tags as TagSummary[] };
}

function decodeSessionResponse(value: unknown): { user: { email: string } } | null {
  if (!isRecord(value) || !isRecord(value.user) || typeof value.user.email !== "string")
    return null;
  return { user: { email: value.user.email } };
}

async function requestJson<T>(
  input: RequestInfo | URL,
  decode: (value: unknown) => T | null,
  init?: RequestInit,
) {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(await response.text());
  const data = decode(await response.json());
  if (!data) throw new Error("Invalid API response");
  return data;
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
  const [checkingSession, setCheckingSession] = createSignal(true);
  const [unauthorized, setUnauthorized] = createSignal(false);
  const [userEmail, setUserEmail] = createSignal("");
  const [offset, setOffset] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(false);
  const [editingId, setEditingId] = createSignal("");
  const [renameValue, setRenameValue] = createSignal("");

  const query = createMemo(() => {
    const params = new URLSearchParams();
    if (search().trim()) params.set("search", search().trim());
    if (selectedTag()) params.set("tag", selectedTag());
    return params.toString();
  });

  async function loadFiles(append = false, pageOffset = 0) {
    const base = query() ? `?${query()}&` : "?";
    const data = await requestJson(
      `/api/files${base}limit=30&offset=${pageOffset}`,
      decodeFilesResponse,
    );
    setFiles((prev) => (append ? [...prev, ...data.files] : data.files));
    setHasMore(data.nextOffset !== null);
  }

  async function loadTags() {
    const data = await requestJson("/api/tags", decodeTagsResponse);
    setTags(data.tags);
  }

  async function bootstrap() {
    try {
      const session = await requestJson("/api/session", decodeSessionResponse);
      setUserEmail(session.user.email);
      setUnauthorized(false);
      await Promise.all([loadFiles(false, 0), loadTags()]);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unauthorized")) {
        setUnauthorized(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load Drive");
    } finally {
      setCheckingSession(false);
    }
  }

  createEffect(() => {
    void query();
    setOffset(0);
    if (!userEmail()) return;
    void loadFiles(false, 0).catch((err) =>
      setError(err instanceof Error ? err.message : "Search failed"),
    );
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
      await requestJson("/api/files", decodeFileResponse, { method: "POST", body: data });
      form.reset();
      setUploadTags("");
      setDescription("");
      await Promise.all([loadFiles(false, 0), loadTags()]);
      setOffset(0);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unauthorized")) {
        setUnauthorized(true);
        setUserEmail("");
        return;
      }
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function signIn() {
    window.location.assign("/api/auth/login");
  }

  function download(file: DriveFile) {
    window.location.assign(`/api/files/${file.id}/download`);
  }

  async function remove(file: DriveFile) {
    if (!confirm(`Delete ${file.name}?`)) return;
    setError("");
    try {
      await fetch(`/api/files/${file.id}`, { method: "DELETE" }).then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
      });
      await Promise.all([loadFiles(false, 0), loadTags()]);
      setOffset(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function startRename(file: DriveFile) {
    setEditingId(file.id);
    setRenameValue(file.name);
  }

  async function submitRename(file: DriveFile) {
    const name = renameValue().trim();
    if (!name || name === file.name) {
      setEditingId("");
      return;
    }
    setError("");
    try {
      await requestJson(`/api/files/${file.id}`, decodeFileResponse, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, name } : f)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setEditingId("");
    }
  }

  async function loadMore() {
    const next = offset() + 30;
    setOffset(next);
    await loadFiles(true, next);
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
            <form method="post" action="/api/auth/logout">
              <button class="btn">Sign out</button>
            </form>
          </div>
        </Show>
      </section>

      <Show when={checkingSession()}>
        <section class="login-card">
          <p>Checking your Shedflare Drive session...</p>
        </section>
      </Show>

      <Show when={!checkingSession() && unauthorized()}>
        <section class="login-card">
          <p>Sign in with the central Shedflare auth worker to open your private drive.</p>
          <button type="button" class="btn btn-primary" onClick={signIn}>
            Sign in
          </button>
        </section>
      </Show>

      <Show when={error()}>
        <div class="error-card">{error()}</div>
      </Show>

      <section class="control-panel" classList={{ hidden: !userEmail() }}>
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
          <button class="btn btn-primary" disabled={busy()}>
            {busy() ? "Uploading..." : "Upload"}
          </button>
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

      <section class="file-grid" classList={{ hidden: !userEmail() }}>
        <Show
          when={files().length > 0}
          fallback={<div class="empty">No files match this shelf.</div>}
        >
          <For each={files()}>
            {(file) => (
              <article class="file-card">
                <div class={`file-mark ${fileGlyph(file).toLowerCase()}`}>{fileGlyph(file)}</div>
                <div class="file-body">
                  <Show
                    when={editingId() === file.id}
                    fallback={<h2 onDblClick={() => startRename(file)}>{file.name}</h2>}
                  >
                    <input
                      class="rename-input"
                      value={renameValue()}
                      onInput={(event) => setRenameValue(event.currentTarget.value)}
                      onBlur={() => submitRename(file)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") submitRename(file);
                        if (event.key === "Escape") setEditingId("");
                      }}
                      autofocus
                    />
                  </Show>
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
                  <button type="button" class="btn" onClick={() => download(file)}>
                    Download
                  </button>
                  <button class="btn" onClick={() => startRename(file)}>
                    Rename
                  </button>
                  <button class="btn btn-danger" onClick={() => void remove(file)}>
                    Delete
                  </button>
                </div>
              </article>
            )}
          </For>
        </Show>
      </section>

      <Show when={hasMore()}>
        <div class="load-more">
          <button class="btn" onClick={() => void loadMore()}>
            Load more
          </button>
        </div>
      </Show>
    </main>
  );
}
