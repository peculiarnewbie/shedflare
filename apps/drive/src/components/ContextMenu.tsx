import { Show, createMemo, createEffect, onCleanup } from "solid-js";
import { useDrive } from "../context";

export default function ContextMenu() {
  const ctx = useDrive();

  const file = createMemo(() => {
    const menu = ctx.contextMenu();
    if (!menu) return undefined;
    return ctx.files().find((f) => f.id === menu.fileId);
  });

  // Click-away handler
  createEffect(() => {
    const menu = ctx.contextMenu();
    if (menu) {
      const handler = () => ctx.setContextMenu(null);
      document.addEventListener("click", handler);
      onCleanup(() => document.removeEventListener("click", handler));
    }
  });

  return (
    <Show when={ctx.contextMenu() && file()}>
      {(menuFile) => {
        const menu = ctx.contextMenu()!;
        return (
          <div
            class="context-menu"
            style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              class="context-menu-item"
              onClick={() => {
                ctx.download(menuFile());
                ctx.setContextMenu(null);
              }}
            >
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
                <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
              </svg>
              Download
            </button>
            <button
              class="context-menu-item"
              onClick={() => {
                ctx.startRename(menuFile());
                ctx.setContextMenu(null);
              }}
            >
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" />
              </svg>
              Rename
            </button>
            <button
              class="context-menu-item context-menu-item-danger"
              onClick={() => {
                ctx.setPendingDeleteId(menuFile().id);
                ctx.setContextMenu(null);
              }}
            >
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
                <path
                  fill-rule="evenodd"
                  d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
                />
              </svg>
              Delete
            </button>
          </div>
        );
      }}
    </Show>
  );
}
