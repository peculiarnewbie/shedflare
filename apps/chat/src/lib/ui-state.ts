import { createSignal } from "solid-js";
import {
  compareThreadRecency,
  compareWorkspaceRecency,
  type Workspace,
  type Thread,
} from "#/domain";

// ---------------------------------------------------------------------------
// Persisted signals
// ---------------------------------------------------------------------------

function readString(key: string, fallback: string): string {
  if (typeof localStorage === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn("[ui-state] failed to parse localStorage value for", key);
    return fallback;
  }
}

function createPersistedSignal(key: string, fallback = "") {
  const [value, rawSet] = createSignal(readString(key, fallback));
  const set = (next: string) => {
    rawSet(next);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, next);
    }
  };
  return [value, set] as const;
}

function createPersistedJsonSignal<T>(key: string, fallback: T) {
  const [value, setValue] = createSignal<T>(readJson<T>(key, fallback));
  const set = (next: T) => {
    setValue(next as Parameters<typeof setValue>[0]);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(next));
    }
  };
  return [value, set] as const;
}

export const [activeWorkspaceId, setActiveWorkspaceId] = createPersistedSignal(
  "shedflare.activeWorkspaceId",
);

// Per-workspace active thread. Previously this was a single global
// `shedflare.activeThreadId`, which meant switching workspaces always lost the
// previously selected thread. We migrate the old value on first read.
function migrateLegacyActiveThread(): Record<string, string> {
  const legacyThreadId = readString("shedflare.activeThreadId", "");
  const legacyWorkspaceId = readString("shedflare.activeWorkspaceId", "");
  if (legacyThreadId && legacyWorkspaceId) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("shedflare.activeThreadId");
    }
    return { [legacyWorkspaceId]: legacyThreadId };
  }
  return {};
}

const [activeThreadByWorkspaceId, setActiveThreadByWorkspaceId] = createPersistedJsonSignal<
  Record<string, string>
>("shedflare.activeThreadByWorkspaceId", migrateLegacyActiveThread());

export function activeThreadId(): string {
  return activeThreadByWorkspaceId()[activeWorkspaceId()] ?? "";
}

export function setActiveThreadId(threadId: string) {
  setActiveThreadIdForWorkspace(activeWorkspaceId(), threadId);
}

export function setActiveThreadIdForWorkspace(workspaceId: string, threadId: string) {
  if (!workspaceId) return;
  setActiveThreadByWorkspaceId({ ...activeThreadByWorkspaceId(), [workspaceId]: threadId });
}

// ---------------------------------------------------------------------------
// Selection validation
// ---------------------------------------------------------------------------

/**
 * Ensures the active workspace and thread selections are still valid.
 * Call after any event batch that may archive or delete workspaces/threads.
 */
export function ensureActiveSelection(workspaces: Workspace[], threads: Thread[]) {
  const currentWorkspaceId = activeWorkspaceId();
  const validWorkspaces = workspaces.filter((w) => !w.archivedAt).sort(compareWorkspaceRecency);
  const nextWorkspace =
    validWorkspaces.find((w) => w.id === currentWorkspaceId) ?? validWorkspaces[0];

  if (nextWorkspace && currentWorkspaceId !== nextWorkspace.id) {
    setActiveWorkspaceId(nextWorkspace.id);
  }

  const selectedWorkspaceId = nextWorkspace?.id ?? currentWorkspaceId;
  const validThreads = threads
    .filter((t) => t.workspaceId === selectedWorkspaceId && !t.archivedAt)
    .sort(compareThreadRecency);
  const currentThreadId = activeThreadId();
  const nextThread = validThreads.find((t) => t.id === currentThreadId) ?? validThreads[0];

  if (nextThread && currentThreadId !== nextThread.id) {
    setActiveThreadId(nextThread.id);
  }
}
