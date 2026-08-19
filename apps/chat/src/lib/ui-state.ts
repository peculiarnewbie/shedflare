import { createSignal } from "solid-js";
import {
  compareThreadRecency,
  compareWorkspaceRecency,
  type Workspace,
  type Thread,
} from "#/domain";
import * as Schema from "effect/Schema";

// ---------------------------------------------------------------------------
// Persisted signals
// ---------------------------------------------------------------------------

function readString(key: string, fallback: string): string {
  if (!globalThis.localStorage) return fallback;
  return localStorage.getItem(key) ?? fallback;
}

type ActiveThreadMap = Record<string, string>;
const ActiveThreadMapSchema = Schema.Record(Schema.String, Schema.String);

function readActiveThreadMap(key: string, fallback: ActiveThreadMap) {
  if (!globalThis.localStorage) return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return { ...Schema.decodeUnknownSync(ActiveThreadMapSchema)(JSON.parse(raw)) };
  } catch {
    console.warn("[ui-state] failed to parse localStorage value for", key);
    return fallback;
  }
}

function createPersistedSignal(key: string, fallback = "") {
  const [value, rawSet] = createSignal(readString(key, fallback));
  const set = (next: string) => {
    rawSet(next);
    if (globalThis.localStorage) {
      localStorage.setItem(key, next);
    }
  };
  return [value, set] as const;
}

function createPersistedActiveThreadSignal(key: string, fallback: ActiveThreadMap) {
  const [value, setValue] = createSignal(readActiveThreadMap(key, fallback));
  const set = (next: ActiveThreadMap) => {
    setValue(() => next);
    if (globalThis.localStorage) {
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
function migrateLegacyActiveThread() {
  const legacyThreadId = readString("shedflare.activeThreadId", "");
  const legacyWorkspaceId = readString("shedflare.activeWorkspaceId", "");
  if (legacyThreadId && legacyWorkspaceId) {
    if (globalThis.localStorage) {
      localStorage.removeItem("shedflare.activeThreadId");
    }
    return { [legacyWorkspaceId]: legacyThreadId };
  }
  return {};
}

const [activeThreadByWorkspaceId, setActiveThreadByWorkspaceId] = createPersistedActiveThreadSignal(
  "shedflare.activeThreadByWorkspaceId",
  migrateLegacyActiveThread(),
);

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
