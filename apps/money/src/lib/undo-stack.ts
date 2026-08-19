import { createSignal } from "solid-js";
import * as Schema from "effect/Schema";
import { execute, type CommandPayload, type CommandType } from "./api";
import { emitOperationFeedback } from "./operation-feedback";
import { emitMoneyDataChanged } from "./data-events";
import type { CommandData } from "../domain/types";

export interface UndoEntry {
  label: string;
  forward: { commandType: CommandType; payload: CommandPayload };
  inverse: { commandType: CommandType; payload: CommandPayload };
}

const [undoStack, setUndoStack] = createSignal<UndoEntry[]>([]);
const [redoStack, setRedoStack] = createSignal<UndoEntry[]>([]);

export { undoStack, redoStack };

function retargetRecreatedEntry(entry: UndoEntry, resultData: CommandData): UndoEntry {
  let restoredId: string;
  try {
    restoredId = Schema.decodeUnknownSync(Schema.String)(resultData.id);
  } catch {
    return entry;
  }
  if (
    !entry.forward.commandType.startsWith("delete_") ||
    !entry.inverse.commandType.startsWith("create_") ||
    !(entry.forward.payload instanceof Object)
  ) {
    return entry;
  }
  return {
    ...entry,
    forward: {
      ...entry.forward,
      payload: { ...entry.forward.payload, id: restoredId },
    },
  };
}

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
    emitOperationFeedback({
      kind: "error",
      message: `Undo failed: ${result.error}`,
      undoable: false,
    });
    return false;
  }
  const restoredEntry = retargetRecreatedEntry(entry, result.data);
  if (restoredEntry !== entry) {
    setRedoStack((prev) => [...prev.slice(0, -1), restoredEntry]);
  }
  emitOperationFeedback({ kind: "success", message: `${entry.label} undone`, undoable: false });
  emitMoneyDataChanged();
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
    emitOperationFeedback({
      kind: "error",
      message: `Redo failed: ${result.error}`,
      undoable: false,
    });
    return false;
  }
  emitOperationFeedback({ kind: "success", message: `${entry.label} redone`, undoable: false });
  emitMoneyDataChanged();
  return true;
}
