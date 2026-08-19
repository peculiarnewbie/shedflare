export type ChatNavigationState = {
  workspaceId: string | null;
  threadId: string | null;
  view: "thread" | "draft" | null;
};

const WORKSPACE_PARAM = "workspaceId";
const THREAD_PARAM = "threadId";
const VIEW_PARAM = "view";

export function readChatNavigationState(url?: URL): ChatNavigationState {
  const currentUrl = url ?? (globalThis.window ? new URL(window.location.href) : null);
  if (!currentUrl) {
    return { workspaceId: null, threadId: null, view: null };
  }

  const view = currentUrl.searchParams.get(VIEW_PARAM);
  return {
    workspaceId: currentUrl.searchParams.get(WORKSPACE_PARAM),
    threadId: currentUrl.searchParams.get(THREAD_PARAM),
    view: view === "draft" || view === "thread" ? view : null,
  };
}

export function withChatNavigationState(url: URL, state: ChatNavigationState) {
  const next = new URL(url.toString());
  if (state.workspaceId) next.searchParams.set(WORKSPACE_PARAM, state.workspaceId);
  else next.searchParams.delete(WORKSPACE_PARAM);
  if (state.threadId) next.searchParams.set(THREAD_PARAM, state.threadId);
  else next.searchParams.delete(THREAD_PARAM);
  if (state.view === "draft") next.searchParams.set(VIEW_PARAM, "draft");
  else next.searchParams.delete(VIEW_PARAM);
  return next;
}

export function writeChatNavigationState(state: ChatNavigationState) {
  if (!globalThis.window) return;

  const current = new URL(window.location.href);
  const next = withChatNavigationState(current, state);
  if (next.href === current.href) return;

  window.history.replaceState(
    window.history.state,
    "",
    `${next.pathname}${next.search}${next.hash}`,
  );
}
