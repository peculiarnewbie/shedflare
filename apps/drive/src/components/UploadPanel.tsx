import { useDrive } from "../context";

export default function UploadPanel() {
  const ctx = useDrive();

  return (
    <form
      class="upload-panel"
      classList={{ "drag-over": ctx.dragging() }}
      onSubmit={ctx.upload}
      onDragOver={(e) => {
        e.preventDefault();
        ctx.setDragging(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        ctx.setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        ctx.setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        ctx.setDragging(false);
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
          disabled={ctx.busy()}
          onChange={(e) => {
            if (e.currentTarget.files?.[0]) {
              e.currentTarget.form?.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
              );
            }
          }}
        />
        <span class="drop-text">
          {ctx.busy()
            ? `Uploading ${ctx.uploadingFileName()}`
            : "Drop files here or click to browse"}
        </span>
      </label>
      <input
        class="upload-tags-input"
        value={ctx.uploadTags()}
        onInput={(e) => ctx.setUploadTags(e.currentTarget.value)}
        placeholder="tags: invoices, house, ideas"
      />
      <input
        class="upload-desc-input"
        value={ctx.description()}
        onInput={(e) => ctx.setDescription(e.currentTarget.value)}
        placeholder="short note"
      />
      {ctx.busy() && (
        <button class="btn upload-btn" type="button" onClick={ctx.cancelUpload}>
          Cancel upload
        </button>
      )}
    </form>
  );
}
