export type CoreErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_PARSE_ERROR"
  | "CONFIG_VERSION_UNSUPPORTED"
  | "CONFIG_UNKNOWN_APP"
  | "CONFIG_INVALID"
  | "MANIFEST_INVALID"
  | "MANIFEST_ID_MISMATCH"
  | "MANIFEST_DEPENDENCY_MISSING"
  | "MANIFEST_DEPENDENCY_CYCLE"
  | "MANIFEST_NOT_FOUND";

export interface CoreErrorDetails {
  readonly filePath?: string;
  readonly fieldPath?: string;
  readonly expectation?: string;
  readonly line?: number;
  readonly column?: number;
}

export class CoreError extends Error {
  readonly name = "CoreError";
  readonly code: CoreErrorCode;
  readonly details: CoreErrorDetails;

  constructor(code: CoreErrorCode, message: string, details: CoreErrorDetails = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export class CatalogValidationError extends Error {
  readonly name = "CatalogValidationError";
  readonly code = "MANIFEST_INVALID" as const;
  readonly errors: readonly CoreError[];

  constructor(errors: readonly CoreError[]) {
    super(errors.map((error) => error.message).join("\n"));
    this.errors = errors;
  }
}
