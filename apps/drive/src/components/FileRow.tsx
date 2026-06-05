import { Show } from "solid-js";
import { useDrive, fileGlyph, formatSize } from "../context";
import type { DriveFile } from "../types";

export default function FileRow(props: { file: DriveFile }) {
  const ctx = useDrive();
  const file = props.file;

  return (
    <div
      class="file-row"
      classList={{ selected: ctx.selectedFileIds().has(file.id) }}
      onClick={(e) => {
        e.stopPropagation();
        if ((e.target as HTMLElement).closest(".row-checkbox")) return;
        const wasSelected = ctx.selectedFileIds().has(file.id);
        ctx.toggleFileSelection(file.id);
        ctx.setSelectedFileId(wasSelected ? "" : file.id);
        if (!wasSelected) ctx.setRightSidebarCollapsed(false);
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
            checked={ctx.selectedFileIds().has(file.id)}
            onChange={() => ctx.toggleFileSelection(file.id)}
          />
        </label>
      </div>
      <div class="col-type">
        <span class={`file-mark-row ${fileGlyph(file).toLowerCase()}`}>{fileGlyph(file)}</span>
      </div>
      <div class="col-name">
        <Show
          when={ctx.editingId() === file.id}
          fallback={
            <span class="row-name-text" onDblClick={() => ctx.startRename(file)}>
              {file.name}
              <Show when={file.isPublic}>
                <span class="public-pill">Public</span>
              </Show>
            </span>
          }
        >
          <input
            class="rename-input"
            value={ctx.renameValue()}
            onInput={(e) => ctx.setRenameValue(e.currentTarget.value)}
            onBlur={() => ctx.submitRename(file)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ctx.submitRename(file);
              if (e.key === "Escape") ctx.setEditingId("");
            }}
            autofocus
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
