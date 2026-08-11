import { execute } from "./api";
import { push } from "./undo-stack";
import { emitOperationFeedback, operationLabel } from "./operation-feedback";

export interface UndoInfo {
  label: string;
  inverse:
    | { commandType: string; payload: unknown }
    | ((data: Record<string, unknown>) => { commandType: string; payload: unknown });
}

export function dispatch(
  commandType: string,
  payload: unknown,
  options?: { opId?: string; undoInfo?: UndoInfo },
): { opId: string; promise: Promise<void> } {
  const opId = options?.opId ?? `op_${crypto.randomUUID().slice(0, 8)}`;
  const promise = execute(commandType, payload)
    .then((result) => {
      if (!result.ok) throw new Error(result.error);
      if (options?.undoInfo) {
        const inverse =
          typeof options.undoInfo.inverse === "function"
            ? options.undoInfo.inverse(result.data)
            : options.undoInfo.inverse;
        push(options.undoInfo.label, { commandType, payload }, inverse);
      }
      emitOperationFeedback({
        kind: "success",
        message: options?.undoInfo?.label ?? `${operationLabel(commandType)} saved`,
        undoable: Boolean(options?.undoInfo),
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "The change could not be saved";
      emitOperationFeedback({
        kind: "error",
        message: `${operationLabel(commandType)} failed: ${message}`,
        undoable: false,
      });
      throw error;
    });
  return { opId, promise };
}
