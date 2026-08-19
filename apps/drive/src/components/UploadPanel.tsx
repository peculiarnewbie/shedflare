import { createSignal } from "solid-js";
import { formatSize, useDrive } from "../context";
import { DriveUploadError, uploadDriveFile, type UploadProgress } from "../lib/upload";

export default function UploadPanel() {
  const ctx = useDrive();
  const [busy, setBusy] = createSignal(false);
  const [uploadingFileName, setUploadingFileName] = createSignal("");
  const [dragging, setDragging] = createSignal(false);
  const [description, setDescription] = createSignal("");
  const [tags, setTags] = createSignal("");
  const [progress, setProgress] = createSignal<UploadProgress | null>(null);
  let uploadController: AbortController | null = null;

  function cancelUpload() {
    uploadController?.abort();
  }

  async function handleUpload(event: Event) {
    event.preventDefault();
    if (busy()) return;

    if (!(event.currentTarget instanceof HTMLFormElement)) return;
    const form = event.currentTarget;
    const namedFileInput = form.elements.namedItem("file");
    const input = namedFileInput instanceof HTMLInputElement ? namedFileInput : null;
    const file = input?.files?.[0];
    if (!file) return;

    setBusy(true);
    setUploadingFileName(file.name);
    setProgress(null);
    ctx.setError("");
    uploadController = new AbortController();
    try {
      await uploadDriveFile({
        file,
        description: description(),
        tags: tags(),
        signal: uploadController.signal,
        onProgress: setProgress,
      });
      form.reset();
      setDescription("");
      setTags("");
      await Promise.all([ctx.loadFiles(false, 0), ctx.loadTags()]);
      ctx.addToast(`Uploaded ${file.name}`, "success");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        ctx.addToast(`Canceled ${file.name}`, "info");
        return;
      }
      if (err instanceof DriveUploadError && err.status === 401) {
        ctx.addToast("Session expired — please sign in again", "error");
        return;
      }
      ctx.addToast(err instanceof Error ? err.message : "Upload failed. Retry the file.", "error");
    } finally {
      setBusy(false);
      setUploadingFileName("");
      setProgress(null);
      uploadController = null;
    }
  }

  return (
    <form
      class="upload-panel"
      classList={{ "drag-over": dragging() }}
      onSubmit={handleUpload}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) {
          const input = e.currentTarget.querySelector<HTMLInputElement>("input[type='file']");
          if (input) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            e.currentTarget.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          }
        }
      }}
    >
      <label class="file-drop">
        <svg
          class="upload-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <input
          name="file"
          type="file"
          disabled={busy()}
          onChange={(e) => {
            if (e.currentTarget.files?.[0]) {
              e.currentTarget.form?.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
              );
            }
          }}
        />
        <span class="drop-text">
          {busy()
            ? `Uploading ${uploadingFileName()}${progress() ? ` · ${progress()!.percent}%` : ""}`
            : "Drop files here or click to browse"}
        </span>
      </label>
      {busy() && progress() && (
        <div class="upload-progress" aria-live="polite">
          <div class="upload-progress-track">
            <span style={{ width: `${progress()!.percent}%` }} />
          </div>
          <span class="upload-progress-detail">
            {formatSize(progress()!.uploadedBytes)} of {formatSize(progress()!.totalBytes)}
            {progress()!.totalParts > 1
              ? ` · ${progress()!.completedParts}/${progress()!.totalParts} parts`
              : ""}
          </span>
        </div>
      )}
      <input
        class="upload-tags-input"
        value={tags()}
        onInput={(e) => setTags(e.currentTarget.value)}
        placeholder="tags: invoices, house, ideas"
      />
      <input
        class="upload-desc-input"
        value={description()}
        onInput={(e) => setDescription(e.currentTarget.value)}
        placeholder="short note"
      />
      {busy() && (
        <button class="btn upload-btn" type="button" onClick={cancelUpload}>
          Cancel upload
        </button>
      )}
    </form>
  );
}
