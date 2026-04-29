import { For, Show } from "solid-js";
import { useDrive } from "../context";

export default function ToastContainer() {
  const ctx = useDrive();

  return (
    <Show when={ctx.toasts().length > 0}>
      <div class="toast-container">
        <For each={ctx.toasts()}>
          {(toast) => (
            <div class={`toast toast-${toast.type}`}>
              <span class="toast-message">{toast.message}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
