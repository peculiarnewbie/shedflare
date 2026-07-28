import { Show, createSignal } from "solid-js";
import { useDrive, fileGlyph, formatSize } from "../context";
import type { DriveFile } from "../types";

export default function FileRow(props: { file: DriveFile }) {
  const ctx = useDrive();
  const file = props.file;
  const [renameValue, setRenameValue] = createSignal("");
  let renameInput!: HTMLInputElement;

  const isEditing = () => ctx.editingId() === file.id;

  function startRename() {
    setRenameValue(file.name);
    ctx.setEditingId(file.id);
    queueMicrotask(() => renameInput?.focus());
  }

  function cancelRename() {
    ctx.setEditingId("");
    setRenameValue("");
  }

  async function submitRename() {
    await ctx.submitRename(file, renameValue());
    cancelRename();
  }

  return (
    <div
      class="file-row"
      classList={{ selected: ctx.selection().has(file.id) }}
      onClick={(e) => {
        e.stopPropagation();
        if ((e.target as HTMLElement).closest(".row-checkbox")) return;
        if (ctx.selection().size > 0) {
          ctx.toggleFileSelection(file.id);
        } else {
          const isCurrentPreview = ctx.selectedFileId() === file.id;
          ctx.setSelectedFileId(isCurrentPreview ? "" : file.id);
          if (!isCurrentPreview) ctx.setRightSidebarCollapsed(false);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.setContextMenu({ x: e.clientX, y: e.clientY, fileId: file.id });
      }}
    >
      <div class="col-checkbox">
        <label class="row-checkbox" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={ctx.selection().has(file.id)}
            onChange={() => ctx.toggleFileSelection(file.id)}
          />
        </label>
      </div>
      <div class="col-type">
        <span class={`file-mark-row ${fileGlyph(file).toLowerCase()}`}>{fileGlyph(file)}</span>
      </div>
      <div class="col-name">
        <Show
          when={isEditing()}
          fallback={
            <span class="row-name-text" onDblClick={startRename}>
              {file.name}
              <Show when={file.isPublic}>
                <span class="public-pill">Public</span>
              </Show>
            </span>
          }
        >
          <input
            ref={(el) => {
              renameInput = el;
            }}
            class="rename-input"
            value={renameValue()}
            onInput={(e) => setRenameValue(e.currentTarget.value)}
            onBlur={() => void submitRename()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitRename();
              if (e.key === "Escape") cancelRename();
            }}
          />
        </Show>
      </div>
      <div class="col-tags">
        <Show when={file.tags.length > 0} fallback={<span class="no-tags">—</span>}>
          <div class="row-tags">
            {file.tags.slice(0, 3).map((tag) => (
              <span>{tag}</span>
            ))}
            {file.tags.length > 3 && <span class="tag-more">+{file.tags.length - 3}</span>}
          </div>
        </Show>
      </div>
      <div class="col-size">{formatSize(file.size)}</div>
      <div class="col-date">{new Date(file.createdAt).toLocaleDateString()}</div>
    </div>
  );
}
