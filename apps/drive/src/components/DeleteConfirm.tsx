import { Show, createMemo } from "solid-js";
import { useDrive } from "../context";

export default function DeleteConfirm() {
  const ctx = useDrive();

  const fileToDelete = createMemo(() => {
    const id = ctx.pendingDeleteId();
    if (!id) return undefined;
    return ctx.files().find((f) => f.id === id);
  });

  return (
    <Show when={ctx.pendingDeleteId() && fileToDelete()}>
      <div class="modal-overlay" onClick={() => ctx.setPendingDeleteId("")}>
        <dialog open class="delete-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Delete file?</h3>
          <p>
            Are you sure you want to delete <strong>{fileToDelete()!.name}</strong>? This action
            cannot be undone.
          </p>
          <div class="delete-modal-actions">
            <button class="btn" onClick={() => ctx.setPendingDeleteId("")}>
              Cancel
            </button>
            <button class="btn btn-danger" onClick={() => ctx.remove(fileToDelete()!)}>
              Delete
            </button>
          </div>
        </dialog>
      </div>
    </Show>
  );
}
