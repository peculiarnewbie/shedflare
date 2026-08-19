import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { useDrive, fileGlyph, formatSize } from "../context";
import type { DriveFile } from "../types";

export default function FileCard(props: { file: DriveFile }) {
  const ctx = useDrive();
  const file = props.file;
  const previewUrl = () => `/api/files/${file.id}/preview`;
  const isImage = () => file.mimeType.startsWith("image/");
  const isVideo = () => file.mimeType.startsWith("video/");
  const [loadVideoPreview, setLoadVideoPreview] = createSignal(false);
  const [renameValue, setRenameValue] = createSignal("");
  let renameInput!: HTMLInputElement;
  let previewElement!: HTMLDivElement;

  onMount(() => {
    if (!isVideo()) return;
    if (!("IntersectionObserver" in globalThis)) {
      setLoadVideoPreview(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setLoadVideoPreview(true);
        observer.disconnect();
      },
      { rootMargin: "200px" },
    );
    observer.observe(previewElement);
    onCleanup(() => observer.disconnect());
  });

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
    <article
      class="file-card"
      classList={{ selected: ctx.selection().has(file.id) }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target instanceof Element && e.target.closest(".card-checkbox")) return;
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
          aria-label={`Select ${file.name}`}
          checked={ctx.selection().has(file.id)}
          onChange={() => ctx.toggleFileSelection(file.id)}
        />
      </label>

      <div
        class="card-preview"
        ref={(element) => {
          previewElement = element;
        }}
      >
        <Show when={file.isPublic}>
          <span class="card-public-badge">Public</span>
        </Show>
        <Show
          when={isImage() || (isVideo() && loadVideoPreview())}
          fallback={
            <div class={`file-mark ${fileGlyph(file).toLowerCase()}`}>{fileGlyph(file)}</div>
          }
        >
          <Show when={isImage()}>
            <img src={previewUrl()} alt={file.name} loading="lazy" />
          </Show>
          <Show when={isVideo() && loadVideoPreview()}>
            <video src={previewUrl()} muted playsinline preload="metadata" />
          </Show>
        </Show>
      </div>

      <div class="file-body">
        <Show when={isEditing()} fallback={<h2 onDblClick={startRename}>{file.name}</h2>}>
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
