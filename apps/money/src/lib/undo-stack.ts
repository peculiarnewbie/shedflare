import { createSignal } from "solid-js";
import { execute } from "./api";

export interface UndoEntry {
  label: string;
  forward: { commandType: string; payload: unknown };
  inverse: { commandType: string; payload: unknown };
}

const [undoStack, setUndoStack] = createSignal<UndoEntry[]>([]);
const [redoStack, setRedoStack] = createSignal<UndoEntry[]>([]);

export { undoStack, redoStack };

export function push(label: string, forward: UndoEntry["forward"], inverse: UndoEntry["inverse"]) {
  setUndoStack((prev) => [...prev, { label, forward, inverse }]);
  setRedoStack([]);
}

export async function undo() {
  const stack = undoStack();
  if (stack.length === 0) return false;
  const entry = stack[stack.length - 1];
  setUndoStack((prev) => prev.slice(0, -1));
  setRedoStack((prev) => [...prev, entry]);
  const result = await execute(entry.inverse.commandType, entry.inverse.payload);
  if (!result.ok) {
    setUndoStack((prev) => [...prev, entry]);
    setRedoStack((prev) => prev.slice(0, -1));
    return false;
  }
  return true;
}

export async function redo() {
  const stack = redoStack();
  if (stack.length === 0) return false;
  const entry = stack[stack.length - 1];
  setRedoStack((prev) => prev.slice(0, -1));
  setUndoStack((prev) => [...prev, entry]);
  const result = await execute(entry.forward.commandType, entry.forward.payload);
  if (!result.ok) {
    setRedoStack((prev) => [...prev, entry]);
    setUndoStack((prev) => prev.slice(0, -1));
    return false;
  }
  return true;
}
