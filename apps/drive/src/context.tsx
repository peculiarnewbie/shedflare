import { createContext, createEffect, createMemo, createSignal, useContext } from "solid-js";
import type {
  ContextMenuState,
  DriveFile,
  SortBy,
  SortOrder,
  TagSummary,
  Toast,
  ViewMode,
} from "./types";

/* ── Decoders ────────────────────────────────────── */

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
    typeof value.isPublic !== "boolean" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.tags) ||
    !value.tags.every((tag) => typeof tag === "string")
  )
    return null;
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
  if (files.some((f) => !f)) return null;
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
  if (tags.some((t) => !t)) return null;
  return { tags: tags as TagSummary[] };
}

function decodeSessionResponse(value: unknown): { user: { email: string } } | null {
  if (!isRecord(value) || !isRecord(value.user) || typeof value.user.email !== "string")
    return null;
  return { user: { email: value.user.email } };
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  decode: (value: unknown) => T | null,
  init?: RequestInit,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(await response.text());
    const data = decode(await response.json());
    if (!data) throw new Error("Invalid API response");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Helpers ─────────────────────────────────────── */

export function formatSize(size: number) {
  const fmt = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${fmt.format(size / 1024)} KB`;
  if (size < 1024 * 1024 * 1024) return `${fmt.format(size / 1024 / 1024)} MB`;
  return `${fmt.format(size / 1024 / 1024 / 1024)} GB`;
}

export function fileGlyph(file: DriveFile) {
  if (file.mimeType.startsWith("image/")) return "IMG";
  if (file.mimeType.includes("pdf")) return "PDF";
  if (file.mimeType.startsWith("video/")) return "VID";
  if (file.mimeType.startsWith("audio/")) return "AUD";
  if (file.mimeType.includes("zip") || file.mimeType.includes("tar")) return "ZIP";
  return "DOC";
}

function sortFiles(files: DriveFile[], sortBy: SortBy, sortOrder: SortOrder): DriveFile[] {
  const sorted = [...files];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "date":
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "size":
        cmp = a.size - b.size;
        break;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });
  return sorted;
}

/* ── Context type ────────────────────────────────── */

export type DriveContextValue = {
  // ── Data ─────────────────────────────────
  files: () => DriveFile[];
  sortedFiles: () => DriveFile[];
  tags: () => TagSummary[];
  loadFiles: (append?: boolean, pageOffset?: number) => Promise<void>;
  loadTags: () => Promise<void>;

  // ── Query ────────────────────────────────
  search: () => string;
  setSearch: (v: string) => void;
  selectedTag: () => string;
  setSelectedTag: (v: string) => void;
  selectedFileId: () => string;
  setSelectedFileId: (v: string) => void;
  selectedFile: () => DriveFile | undefined;

  // ── View ─────────────────────────────────
  viewMode: () => ViewMode;
  setViewMode: (v: ViewMode) => void;
  sortBy: () => SortBy;
  setSortBy: (v: SortBy) => void;
  sortOrder: () => SortOrder;
  setSortOrder: (v: SortOrder) => void;

  // ── Pagination ───────────────────────────
  offset: () => number;
  hasMore: () => boolean;
  loadMore: () => Promise<void>;

  // ── Session ──────────────────────────────
  checkingSession: () => boolean;
  unauthorized: () => boolean;
  userEmail: () => string;
  signIn: () => void;

  // ── Feedback ─────────────────────────────
  error: () => string;
  setError: (v: string) => void;
  toasts: () => Toast[];
  addToast: (message: string, type?: Toast["type"]) => void;

  // ── UI coordination ──────────────────────
  editingId: () => string;
  setEditingId: (v: string) => void;
  contextMenu: () => ContextMenuState | null;
  setContextMenu: (v: ContextMenuState | null) => void;
  pendingDeleteId: () => string;
  setPendingDeleteId: (v: string) => void;
  leftSidebarOpen: () => boolean;
  setLeftSidebarOpen: (v: boolean) => void;
  rightSidebarCollapsed: () => boolean;
  setRightSidebarCollapsed: (v: boolean) => void;
  selection: () => Set<string>;
  toggleFileSelection: (id: string) => void;
  clearSelection: () => void;

  // ── File actions ─────────────────────────
  download: (file: DriveFile) => void;
  publicUrl: (file: DriveFile) => string;
  copyPublicLink: (file: DriveFile) => Promise<void>;
  setFilePublic: (file: DriveFile, isPublic: boolean) => Promise<void>;
  remove: (file: DriveFile) => Promise<void>;
  removeSelected: () => Promise<void>;
  downloadSelected: () => void;
  submitRename: (file: DriveFile, newName: string) => Promise<void>;
};

const DriveCtx = createContext<DriveContextValue>();

export function useDrive() {
  const ctx = useContext(DriveCtx);
  if (!ctx) throw new Error("useDrive must be used within DriveProvider");
  return ctx;
}

/* ── Provider ────────────────────────────────────── */

export function DriveProvider(props: { children: import("solid-js").JSX.Element }) {
  // ── Data ──────────────────────────────────
  const [files, setFiles] = createSignal<DriveFile[]>([]);
  const [tags, setTags] = createSignal<TagSummary[]>([]);

  // ── Query ─────────────────────────────────
  const [search, setSearch] = createSignal("");
  const [selectedTag, setSelectedTag] = createSignal("");
  const [selectedFileId, setSelectedFileId] = createSignal("");

  // ── View ──────────────────────────────────
  const [viewMode, setViewMode] = createSignal<ViewMode>("grid");
  const [sortBy, setSortBy] = createSignal<SortBy>("date");
  const [sortOrder, setSortOrder] = createSignal<SortOrder>("desc");

  // ── Pagination ────────────────────────────
  const [offset, setOffset] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(false);

  // ── Session ───────────────────────────────
  const [checkingSession, setCheckingSession] = createSignal(true);
  const [unauthorized, setUnauthorized] = createSignal(false);
  const [userEmail, setUserEmail] = createSignal("");

  // ── Feedback ──────────────────────────────
  const [error, setError] = createSignal("");
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  // ── UI coordination ───────────────────────
  const [editingId, setEditingId] = createSignal("");
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = createSignal("");
  const [leftSidebarOpen, setLeftSidebarOpen] = createSignal(true);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = createSignal(false);
  const [selection, setSelection] = createSignal(new Set<string>());

  // ── Derived ───────────────────────────────

  const selectedFile = createMemo(() => {
    const id = selectedFileId();
    if (!id) return undefined;
    return files().find((f) => f.id === id);
  });

  const sortedFiles = createMemo(() => sortFiles(files(), sortBy(), sortOrder()));

  const query = createMemo(() => {
    const params = new URLSearchParams();
    if (search().trim()) params.set("search", search().trim());
    if (selectedTag()) params.set("tag", selectedTag());
    return params.toString();
  });

  // ── API ───────────────────────────────────

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

  // ── Toast helper ──────────────────────────

  function addToast(message: string, type: Toast["type"] = "info") {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  // ── Selection helpers ─────────────────────

  function toggleFileSelection(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelection(new Set<string>());
  }

  // ── File actions ──────────────────────────

  function signIn() {
    window.location.assign("/api/auth/login");
  }

  function download(file: DriveFile) {
    window.location.assign(`/api/files/${file.id}/download`);
  }

  function publicUrl(file: DriveFile) {
    return `${window.location.origin}/public/files/${encodeURIComponent(file.id)}/download`;
  }

  async function copyPublicLink(file: DriveFile) {
    if (!file.isPublic) {
      addToast("Publish the file before copying its public link", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl(file));
      addToast("Public link copied", "success");
    } catch {
      addToast(publicUrl(file), "info");
    }
  }

  async function setFilePublic(file: DriveFile, isPublic: boolean) {
    setError("");
    try {
      const data = await requestJson(`/api/files/${file.id}`, decodeFileResponse, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPublic }),
      });
      setFiles((prev) => prev.map((f) => (f.id === file.id ? data.file : f)));
      addToast(isPublic ? "File is now public" : "Public sharing disabled", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update sharing");
    }
  }

  async function remove(file: DriveFile) {
    setError("");
    try {
      const response = await fetch(`/api/files/${file.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await response.text());
      setSelectedFileId("");
      setPendingDeleteId("");
      await Promise.all([loadFiles(false, 0), loadTags()]);
      setOffset(0);
      addToast(`Deleted ${file.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function removeSelected() {
    const ids = [...selection()];
    if (ids.length === 0) return;
    setError("");
    let deleted = 0;
    for (const id of ids) {
      try {
        await fetch(`/api/files/${id}`, { method: "DELETE" });
        deleted++;
      } catch {
        // continue with remaining
      }
    }
    clearSelection();
    await Promise.all([loadFiles(false, 0), loadTags()]);
    setOffset(0);
    addToast(`Deleted ${deleted} file${deleted !== 1 ? "s" : ""}`);
  }

  function downloadSelected() {
    for (const id of selection()) {
      const file = files().find((f) => f.id === id);
      if (file) download(file);
    }
  }

  async function submitRename(file: DriveFile, newName: string) {
    const name = newName.trim();
    if (!name || name === file.name) return;
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
    }
  }

  async function loadMore() {
    const next = offset() + 30;
    setOffset(next);
    await loadFiles(true, next);
  }

  /* ── Value ────────────────────────────────── */

  const value: DriveContextValue = {
    files,
    sortedFiles,
    tags,
    loadFiles,
    loadTags,
    search,
    setSearch,
    selectedTag,
    setSelectedTag,
    selectedFileId,
    setSelectedFileId,
    selectedFile,
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    offset,
    hasMore,
    loadMore,
    checkingSession,
    unauthorized,
    userEmail,
    signIn,
    error,
    setError,
    toasts,
    addToast,
    editingId,
    setEditingId,
    contextMenu,
    setContextMenu,
    pendingDeleteId,
    setPendingDeleteId,
    leftSidebarOpen,
    setLeftSidebarOpen,
    rightSidebarCollapsed,
    setRightSidebarCollapsed,
    selection,
    toggleFileSelection,
    clearSelection,
    download,
    publicUrl,
    copyPublicLink,
    setFilePublic,
    remove,
    removeSelected,
    downloadSelected,
    submitRename,
  };

  return <DriveCtx.Provider value={value}>{props.children}</DriveCtx.Provider>;
}
