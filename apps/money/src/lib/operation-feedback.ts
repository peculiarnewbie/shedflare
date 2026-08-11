export const OPERATION_FEEDBACK_EVENT = "money:operation-feedback";

export type OperationFeedback =
  | { kind: "success"; message: string; undoable: boolean }
  | { kind: "error"; message: string; undoable: false };

export function emitOperationFeedback(detail: OperationFeedback): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OperationFeedback>(OPERATION_FEEDBACK_EVENT, { detail }));
}

export function operationLabel(commandType: string): string {
  return commandType
    .replace(/_/g, " ")
    .replace(/^(create|update|set|add|remove|delete|close|reopen) /, "")
    .replace(/^./, (character) => character.toUpperCase());
}
