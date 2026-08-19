import { execute, type CommandPayload, type CommandType } from "./api";
import { push } from "./undo-stack";
import { emitOperationFeedback, operationLabel } from "./operation-feedback";
import type { CommandData } from "../domain/types";

export interface UndoInfo {
  label: string;
  inverse:
    | { commandType: CommandType; payload: CommandPayload }
    | ((data: CommandData) => { commandType: CommandType; payload: CommandPayload });
}

export interface DispatchResult {
  opId: string;
  promise: Promise<void>;
}

export function requireCommandId(data: CommandData): string {
  if (!data.id) throw new Error("Command response did not include an id");
  return data.id;
}

export function dispatch(
  commandType: CommandType,
  payload: CommandPayload,
  options?: { opId?: string; undoInfo?: UndoInfo },
): DispatchResult {
  const opId = options?.opId ?? `op_${crypto.randomUUID().slice(0, 8)}`;
  const promise = execute(commandType, payload)
    .then((result) => {
      if (!result.ok) throw new Error(result.error);
      if (options?.undoInfo) {
        const inverse =
          options.undoInfo.inverse instanceof Function
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
    .catch((error) => {
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
