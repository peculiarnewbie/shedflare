import { Show } from "solid-js";
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

  return (
    <article
      class="file-card"
      classList={{ selected: ctx.selectedFileIds().has(file.id) }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".card-checkbox")) return;
        ctx.setSelectedFileId(file.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.setContextMenu({ x: e.clientX, y: e.clientY, fileId: file.id });
      }}
    >
      <label class="card-checkbox" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={ctx.selectedFileIds().has(file.id)}
          onChange={() => ctx.toggleFileSelection(file.id)}
        />
      </label>

      <div class="card-preview">
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
        <Show
          when={ctx.editingId() === file.id}
          fallback={<h2 onDblClick={() => ctx.startRename(file)}>{file.name}</h2>}
        >
          <input
            class="rename-input"
            value={ctx.renameValue()}
            onInput={(e) => ctx.setRenameValue(e.currentTarget.value)}
            onBlur={() => ctx.submitRename(file)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ctx.submitRename(file);
              if (e.key === "Escape") ctx.setEditingId("");
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
