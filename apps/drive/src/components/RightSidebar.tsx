import { Show, createEffect, onCleanup } from "solid-js";
import { useDrive } from "../context";
import FileDetailPanel from "./FileDetailPanel";

export default function RightSidebar() {
  const ctx = useDrive();
  const isOpen = () => !!ctx.selectedFileId() && !!ctx.selectedFile();

  // Click-outside handler
  function handleClick(e: MouseEvent) {
    if (!isOpen()) return;
    const sidebar = document.querySelector(".right-sidebar");
    if (sidebar && !sidebar.contains(e.target as Node)) {
      ctx.setSelectedFileId("");
    }
  }

  createEffect(() => {
    if (isOpen()) {
      document.addEventListener("mousedown", handleClick);
      onCleanup(() => document.removeEventListener("mousedown", handleClick));
    }
  });

  return (
    <Show when={isOpen()}>
      <div class="right-sidebar-backdrop" onClick={() => ctx.setSelectedFileId("")} />
      <aside class="right-sidebar open">
        <button class="right-sidebar-close" onClick={() => ctx.setSelectedFileId("")}>
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
          </svg>
        </button>
        <FileDetailPanel />
      </aside>
    </Show>
  );
}
