import { Show, createSignal } from "solid-js";
import { useDrive, fileGlyph, formatSize } from "../context";
import type { DriveFile } from "../types";

const PREVIEWABLE_TYPES = ["image/", "video/"];

function isPreviewable(mimeType: string) {
  return PREVIEWABLE_TYPES.some((prefix) => mimeType.startsWith(prefix));
}

export default function FileCard(props: { file: DriveFile }) {
  const ctx = useDrive();
  const file = props.file;
  const previewUrl = () => `/api/files/${file.id}/preview`;
  const showPreview = () => isPreviewable(file.mimeType);
  const [renameValue, setRenameValue] = createSignal("");

  const isEditing = () => ctx.editingId() === file.id;

  function startRename() {
    setRenameValue(file.name);
    ctx.setEditingId(file.id);
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
    <article
      class="file-card"
      classList={{ selected: ctx.selection().has(file.id) }}
      onClick={(e) => {
        e.stopPropagation();
        if ((e.target as HTMLElement).closest(".card-checkbox")) return;
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
      <label class="card-checkbox" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={ctx.selection().has(file.id)}
          onChange={() => ctx.toggleFileSelection(file.id)}
        />
      </label>

      <div class="card-preview">
        <Show when={file.isPublic}>
          <span class="card-public-badge">Public</span>
        </Show>
        <Show
          when={showPreview()}
          fallback={
            <div class={`file-mark ${fileGlyph(file).toLowerCase()}`}>{fileGlyph(file)}</div>
          }
        >
          <Show when={file.mimeType.startsWith("image/")}>
            <img src={previewUrl()} alt={file.name} loading="lazy" />
          </Show>
          <Show when={file.mimeType.startsWith("video/")}>
            <video src={previewUrl()} muted preload="metadata" />
          </Show>
        </Show>
      </div>

      <div class="file-body">
        <Show when={isEditing()} fallback={<h2 onDblClick={startRename}>{file.name}</h2>}>
          <input
            class="rename-input"
            value={renameValue()}
            onInput={(e) => setRenameValue(e.currentTarget.value)}
            onBlur={() => void submitRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitRename();
              if (e.key === "Escape") cancelRename();
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
          <Show when={file.tags.length > 0}>
            {file.tags.map((tag) => (
              <span>{tag}</span>
            ))}
          </Show>
        </div>
      </div>
    </article>
  );
}
