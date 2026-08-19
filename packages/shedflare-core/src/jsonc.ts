import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { CoreError, type CoreErrorCode } from "./errors.ts";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

interface SourceLocation {
  line: number;
  column: number;
}

function locationAt(text: string, offset: number): SourceLocation {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  return { line, column: offset - lastNewline };
}

export function parseJsonc(
  text: string,
  filePath: string,
  code: Extract<CoreErrorCode, "CONFIG_PARSE_ERROR" | "MANIFEST_INVALID"> = "MANIFEST_INVALID",
): JsonValue {
  const errors: ParseError[] = [];
  const result = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) {
    const error = errors[0];
    const location = locationAt(text, error.offset);
    throw new CoreError(
      code,
      `${filePath}:${location.line}:${location.column} ${printParseErrorCode(error.error)}`,
      {
        filePath,
        expectation: printParseErrorCode(error.error),
        line: location.line,
        column: location.column,
      },
    );
  }
  // SAFETY: jsonc-parser returns only JSON-compatible values after successfully parsing JSONC.
  return result as JsonValue;
}
