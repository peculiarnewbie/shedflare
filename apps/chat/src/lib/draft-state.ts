import { createSignal } from "solid-js";
import {
  DEFAULT_SEARCHES_PER_TURN,
  clampSearchesPerTurn,
  createThread,
  decodeThreadRow,
  nowIso,
  ReasoningLevel as ReasoningLevelSchema,
  ThreadRow,
  type ExternalValue,
  type ReasoningLevel,
  type Thread,
  type Workspace,
} from "#/domain";
import * as Schema from "effect/Schema";

export type DraftAttachmentChip = {
  localId: string;
  attachmentId: string | null;
  threadId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: "uploading" | "ready" | "failed";
  previewUrl?: string;
};

export type DraftChatState = {
  workspaceId: string;
  thread: Thread;
  text: string;
  modelId: string;
  reasoningLevel: ReasoningLevel;
  search: boolean;
  searchLimit: number;
  attachments: DraftAttachmentChip[];
  updatedAt: string;
};

export type WorkspaceConversationView = "thread" | "draft";

type DraftAttachmentCleanup = Pick<DraftAttachmentChip, "localId" | "attachmentId" | "previewUrl">;

const DRAFTS_KEY = "shedflare.workspaceDrafts";
const VIEWS_KEY = "shedflare.workspaceDraftViews";

const PersistedDraftAttachmentSchema = Schema.Struct({
  localId: Schema.String,
  attachmentId: Schema.NullOr(Schema.String),
  threadId: Schema.String,
  fileName: Schema.String,
  mimeType: Schema.String,
  sizeBytes: Schema.Number,
  status: Schema.Literals(["uploading", "ready", "failed"]),
});
const PersistedDraftSchema = Schema.Struct({
  workspaceId: Schema.String,
  thread: ThreadRow,
  text: Schema.String,
  modelId: Schema.String,
  reasoningLevel: ReasoningLevelSchema,
  search: Schema.Boolean,
  searchLimit: Schema.Number,
  attachments: Schema.Array(PersistedDraftAttachmentSchema),
  updatedAt: Schema.String,
});
const PersistedDraftsSchema = Schema.Record(Schema.String, PersistedDraftSchema);
const DraftViewsSchema = Schema.Record(Schema.String, Schema.Literals(["thread", "draft"]));

function readStoredValue(key: string): ExternalValue {
  if (!globalThis.localStorage) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("[draft-state] failed to parse localStorage value for", key);
    return null;
  }
}

function persistJson(key: string, value: ExternalValue) {
  if (!globalThis.localStorage) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function omitKey<T>(value: Record<string, T>, key: string) {
  return Object.fromEntries(Object.entries(value).filter(([entryKey]) => entryKey !== key));
}

let restoredCleanup: DraftAttachmentCleanup[] = [];
let strippedPersistedAttachments = false;

function readDrafts() {
  let parsed: Schema.Schema.Type<typeof PersistedDraftsSchema> = {};
  try {
    parsed = Schema.decodeUnknownSync(PersistedDraftsSchema)(readStoredValue(DRAFTS_KEY));
  } catch {
    // Invalid or obsolete persisted drafts are discarded at this storage boundary.
  }
  const drafts: Record<string, DraftChatState> = {};

  for (const [workspaceId, draft] of Object.entries(parsed)) {
    if (!draft?.thread?.id) continue;
    if (draft.attachments.length > 0) {
      restoredCleanup.push(
        ...draft.attachments.map((attachment) => ({
          localId: attachment.localId,
          attachmentId: attachment.attachmentId,
        })),
      );
      strippedPersistedAttachments = true;
    }
    drafts[workspaceId] = {
      ...draft,
      thread: decodeThreadRow(draft.thread),
      searchLimit: clampSearchesPerTurn(draft.searchLimit),
      attachments: [],
    };
  }

  return drafts;
}

function readViews() {
  try {
    return { ...Schema.decodeUnknownSync(DraftViewsSchema)(readStoredValue(VIEWS_KEY)) };
  } catch {
    return {};
  }
}

function serializeDrafts(drafts: Record<string, DraftChatState>) {
  return Object.fromEntries(
    Object.entries(drafts).map(([workspaceId, draft]) => [
      workspaceId,
      {
        ...draft,
        attachments: draft.attachments.map(({ previewUrl: _, ...attachment }) => attachment),
      },
    ]),
  );
}

const [draftsSignal, setDraftsSignal] = createSignal<Record<string, DraftChatState>>(readDrafts());
const [viewsSignal, setViewsSignal] =
  createSignal<Record<string, WorkspaceConversationView>>(readViews());
const [pendingCleanupVersion, setPendingCleanupVersion] = createSignal(0);

if (strippedPersistedAttachments) {
  persistJson(DRAFTS_KEY, serializeDrafts(draftsSignal()));
}

function writeDrafts(next: Record<string, DraftChatState>) {
  setDraftsSignal(next);
  persistJson(DRAFTS_KEY, serializeDrafts(next));
}

function writeViews(next: Record<string, WorkspaceConversationView>) {
  setViewsSignal(next);
  persistJson(VIEWS_KEY, next);
}

function queueAttachmentCleanup(attachments: DraftAttachmentCleanup[]) {
  if (attachments.length === 0) return;
  restoredCleanup = [...restoredCleanup, ...attachments];
  setPendingCleanupVersion((value) => value + 1);
}

function collectAttachmentCleanup(draft: DraftChatState | undefined) {
  if (!draft) return [];
  return draft.attachments.map((attachment) => ({
    localId: attachment.localId,
    attachmentId: attachment.attachmentId,
    previewUrl: attachment.previewUrl,
  }));
}

export function draftsByWorkspace() {
  return draftsSignal();
}

export function workspaceConversationViews() {
  return viewsSignal();
}

export function getWorkspaceDraft(workspaceId: string | null | undefined) {
  if (!workspaceId) return null;
  return draftsSignal()[workspaceId] ?? null;
}

export function getWorkspaceConversationView(workspaceId: string | null | undefined) {
  if (!workspaceId) return "thread" as const;
  return viewsSignal()[workspaceId] ?? "thread";
}

export function ensureWorkspaceDraft(input: {
  workspace: Workspace;
  modelId: string;
  reasoningLevel: ReasoningLevel;
  search: boolean;
  searchLimit?: number;
}) {
  const existing = getWorkspaceDraft(input.workspace.id);
  if (existing) return existing;

  const draft: DraftChatState = {
    workspaceId: input.workspace.id,
    thread: createThread({ workspaceId: input.workspace.id }),
    text: "",
    modelId: input.modelId,
    reasoningLevel: input.reasoningLevel,
    search: input.search,
    searchLimit: clampSearchesPerTurn(input.searchLimit ?? DEFAULT_SEARCHES_PER_TURN),
    attachments: [],
    updatedAt: nowIso(),
  };
  writeDrafts({
    ...draftsSignal(),
    [input.workspace.id]: draft,
  });
  return draft;
}

export function updateWorkspaceDraft(
  workspaceId: string,
  updater: (draft: DraftChatState) => DraftChatState,
) {
  const current = getWorkspaceDraft(workspaceId);
  if (!current) return null;
  const next = updater(current);
  writeDrafts({
    ...draftsSignal(),
    [workspaceId]: {
      ...next,
      updatedAt: next.updatedAt ?? nowIso(),
    },
  });
  return next;
}

export function replaceWorkspaceDraftAttachments(
  workspaceId: string,
  attachments: DraftAttachmentChip[],
) {
  return updateWorkspaceDraft(workspaceId, (draft) => ({
    ...draft,
    attachments,
    updatedAt: nowIso(),
  }));
}

export function upsertWorkspaceDraftAttachment(
  workspaceId: string,
  attachment: DraftAttachmentChip,
) {
  return updateWorkspaceDraft(workspaceId, (draft) => {
    const existing = draft.attachments.some((item) => item.localId === attachment.localId);
    return {
      ...draft,
      attachments: existing
        ? draft.attachments.map((item) => (item.localId === attachment.localId ? attachment : item))
        : [...draft.attachments, attachment],
      updatedAt: nowIso(),
    };
  });
}

export function removeWorkspaceDraftAttachment(workspaceId: string, localId: string) {
  const draft = getWorkspaceDraft(workspaceId);
  if (!draft) return null;
  const removed = draft.attachments.find((attachment) => attachment.localId === localId) ?? null;
  if (!removed) return null;
  replaceWorkspaceDraftAttachments(
    workspaceId,
    draft.attachments.filter((attachment) => attachment.localId !== localId),
  );
  return removed;
}

export function activateWorkspaceDraftView(workspaceId: string) {
  writeViews({
    ...viewsSignal(),
    [workspaceId]: "draft",
  });
}

export function activateWorkspaceThreadView(workspaceId: string) {
  writeViews({
    ...viewsSignal(),
    [workspaceId]: "thread",
  });
}

export function clearWorkspaceDraft(workspaceId: string) {
  const draft = getWorkspaceDraft(workspaceId);
  queueAttachmentCleanup(collectAttachmentCleanup(draft ?? undefined));
  writeDrafts(omitKey(draftsSignal(), workspaceId));
  writeViews({
    ...viewsSignal(),
    [workspaceId]: "thread",
  });
}

export function finalizeWorkspaceDraft(workspaceId: string) {
  writeDrafts(omitKey(draftsSignal(), workspaceId));
  writeViews({
    ...viewsSignal(),
    [workspaceId]: "thread",
  });
}

export function clearAllDraftState() {
  restoredCleanup = [];
  setPendingCleanupVersion(0);
  setDraftsSignal({});
  setViewsSignal({});
  if (globalThis.localStorage) {
    localStorage.removeItem(DRAFTS_KEY);
    localStorage.removeItem(VIEWS_KEY);
  }
}

export function reconcileDraftState(workspaces: Workspace[], _threads: Thread[]) {
  const validWorkspaceIds = new Set(
    workspaces.filter((workspace) => !workspace.archivedAt).map((workspace) => workspace.id),
  );

  let nextDrafts = draftsSignal();
  let nextViews = viewsSignal();

  for (const workspaceId of Object.keys(nextDrafts)) {
    if (validWorkspaceIds.has(workspaceId)) continue;
    queueAttachmentCleanup(collectAttachmentCleanup(nextDrafts[workspaceId]));
    nextDrafts = omitKey(nextDrafts, workspaceId);
  }

  for (const workspaceId of Object.keys(nextViews)) {
    if (validWorkspaceIds.has(workspaceId)) continue;
    nextViews = omitKey(nextViews, workspaceId);
  }

  if (nextDrafts !== draftsSignal()) {
    writeDrafts(nextDrafts);
  }
  if (nextViews !== viewsSignal()) {
    writeViews(nextViews);
  }
}

export function pendingDraftAttachmentCleanupTick() {
  return pendingCleanupVersion();
}

export function consumePendingDraftAttachmentCleanup() {
  const next = restoredCleanup;
  restoredCleanup = [];
  return next;
}
