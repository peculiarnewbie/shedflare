import { describe, expect, test } from "vitest";
import { editableVars, hiddenSensitiveVarNames, isSensitiveVarName } from "./config-vars";

describe("config var redaction", () => {
  test("classifies secret-like keys as sensitive", () => {
    expect(isSensitiveVarName("OPENCODE_GO_API_KEY")).toBe(true);
    expect(isSensitiveVarName("UPLOAD_TOKEN_SECRET")).toBe(true);
    expect(isSensitiveVarName("CLIENT_SECRET")).toBe(true);
    expect(isSensitiveVarName("DEFAULT_MODEL_ID")).toBe(false);
    expect(isSensitiveVarName("CLOUDFLARE_ACCOUNT_ID")).toBe(false);
  });

  test("returns only non-sensitive vars for editing", () => {
    expect(
      editableVars({
        DEFAULT_MODEL_ID: "auto",
        OPENCODE_GO_API_KEY: "secret",
        CLOUDFLARE_ACCOUNT_ID: "account",
      }),
    ).toEqual({
      DEFAULT_MODEL_ID: "auto",
      CLOUDFLARE_ACCOUNT_ID: "account",
    });
  });

  test("lists hidden sensitive var names without values", () => {
    expect(
      hiddenSensitiveVarNames({
        DEFAULT_MODEL_ID: "auto",
        UPLOAD_TOKEN_SECRET: "secret",
        EXA_API_KEY: "secret",
      }),
    ).toEqual(["EXA_API_KEY", "UPLOAD_TOKEN_SECRET"]);
  });
});
