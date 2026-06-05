import { createSignal } from "solid-js";
import { useDrive } from "../context";
import type { DriveFile } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeFileResponse(value: unknown): { file: DriveFile } | null {
  if (!isRecord(value)) return null;
  if (
    !isRecord(value.file) ||
    typeof value.file.id !== "string" ||
    typeof value.file.name !== "string"
  )
    return null;
  return { file: value.file as unknown as DriveFile };
}

export default function UploadPanel() {
  const ctx = useDrive();
  const [busy, setBusy] = createSignal(false);
  const [uploadingFileName, setUploadingFileName] = createSignal("");
  const [dragging, setDragging] = createSignal(false);
  const [description, setDescription] = createSignal("");
  const [tags, setTags] = createSignal("");
  let uploadController: AbortController | null = null;

  function cancelUpload() {
    uploadController?.abort();
  }

  async function handleUpload(event: Event) {
    event.preventDefault();
    if (busy()) return;

    const form = event.currentTarget as HTMLFormElement;
    const input = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    const data = new FormData();
    data.set("file", file);
    data.set("description", description());
    data.set("tags", tags());

    setBusy(true);
    setUploadingFileName(file.name);
    ctx.setError("");
    uploadController = new AbortController();
    try {
      const response = await fetch("/api/files", {
        method: "POST",
        body: data,
        signal: uploadController.signal,
      });
      if (!response.ok) throw new Error(await response.text());
      const decoded = decodeFileResponse(await response.json());
      if (!decoded) throw new Error("Invalid API response");
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
      if (err instanceof Error && err.message.includes("Unauthorized")) {
        ctx.addToast("Session expired — please sign in again", "error");
        return;
      }
      ctx.setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setUploadingFileName("");
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
          const input = e.currentTarget.querySelector(
            "input[type='file']",
          ) as HTMLInputElement | null;
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
          {busy() ? `Uploading ${uploadingFileName()}` : "Drop files here or click to browse"}
        </span>
      </label>
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
