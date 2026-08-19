export const OPERATION_FEEDBACK_EVENT = "money:operation-feedback";

export type OperationFeedback =
  | { kind: "success"; message: string; undoable: boolean }
  | { kind: "error"; message: string; undoable: false };

export const OperationFeedbackSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("success"),
    message: Schema.String,
    undoable: Schema.Boolean,
  }),
  Schema.Struct({
    kind: Schema.Literal("error"),
    message: Schema.String,
    undoable: Schema.Literal(false),
  }),
]);

export function emitOperationFeedback(detail: OperationFeedback): void {
  if (!globalThis.window) return;
  window.dispatchEvent(new CustomEvent<OperationFeedback>(OPERATION_FEEDBACK_EVENT, { detail }));
}

export function operationLabel(commandType: string): string {
  return commandType
    .replace(/_/g, " ")
    .replace(/^(create|update|set|add|remove|delete|close|reopen) /, "")
    .replace(/^./, (character) => character.toUpperCase());
}
import * as Schema from "effect/Schema";
