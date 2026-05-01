import { createSignal } from "solid-js";

type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

let nextId = 0;

export function useToast() {
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);

  function add(message: string, kind: ToastKind = "info", duration = 3000) {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }

  return {
    toasts,
    add,
    success: (msg: string) => add(msg, "success"),
    error: (msg: string) => add(msg, "error"),
    info: (msg: string) => add(msg, "info"),
  };
}

export default function ToastContainer(props: { toasts: () => ToastItem[] }) {
  return (
    <div class="toast-container">
      {props.toasts().map((t) => (
        <div class={`toast ${t.kind}`}>{t.message}</div>
      ))}
    </div>
  );
}
