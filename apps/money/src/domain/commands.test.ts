import { describe, expect, test } from "vite-plus/test";
import { CommandPayloadSchemas, decodeCommand } from "./commands";
import { SYNC_COMMAND_TYPES } from "./types";

describe("decodeCommand", () => {
  test("decodes a well-formed create_account payload", () => {
    const out = decodeCommand("create_account", { name: "Checking", balance: 100 });
    expect(out).toEqual({ name: "Checking", balance: 100 });
  });

  test("throws on a missing required field", () => {
    expect(() => decodeCommand("create_account", {})).toThrow();
    expect(() => decodeCommand("create_account", { balance: 100 })).toThrow();
  });

  test("coerces invalid types to a parse error", () => {
    expect(() => decodeCommand("create_account", { name: 42 })).toThrow();
  });

  test("rejects unknown extra fields only when schema is strict", () => {
    // create_account schema doesn't have `.strict`; extra fields pass.
    // We just assert that known extra fields are *allowed*, not required.
    const out = decodeCommand("create_account", { name: "x", extra: "ignored" });
    expect(out.name).toBe("x");
  });

  test("reorder_accounts requires an array of strings", () => {
    const out = decodeCommand("reorder_accounts", { ids: ["a", "b"] });
    expect(out).toEqual({ ids: ["a", "b"] });
    expect(() => decodeCommand("reorder_accounts", { ids: "not-an-array" })).toThrow();
  });

  test("update_account fields are individually optional", () => {
    const out = decodeCommand("update_account", { id: "acct_1" });
    expect(out).toEqual({ id: "acct_1" });
  });

  test("import_transactions accepts an array of parsed transactions", () => {
    const out = decodeCommand("import_transactions", {
      accountId: "acct_1",
      transactions: [{ date: "2026-04-15", amount: -1000 }],
      isPreview: true,
    });
    expect(out.transactions).toHaveLength(1);
    expect(out.isPreview).toBe(true);
  });

  test("update_dashboard widgets must include x/y/width/height as numbers", () => {
    const ok = decodeCommand("update_dashboard", {
      widgets: [{ id: "w1", type: "net-worth", x: 0, y: 0, width: 6, height: 3 }],
    });
    expect(ok.widgets).toHaveLength(1);
    expect(() =>
      decodeCommand("update_dashboard", {
        widgets: [{ id: "w1", type: "net-worth", x: "0", y: 0, width: 6, height: 3 }],
      }),
    ).toThrow();
  });

  test("create_note requires noteableType, noteableId, body", () => {
    expect(() => decodeCommand("create_note", { body: "x" })).toThrow();
    const out = decodeCommand("create_note", {
      noteableType: "account",
      noteableId: "acct_1",
      body: "hi",
    });
    expect(out.body).toBe("hi");
  });
});

describe("CommandPayloadSchemas covers SYNC_COMMAND_TYPES", () => {
  test("every sync command type has a payload schema", () => {
    const missing: string[] = [];
    for (const cmd of SYNC_COMMAND_TYPES) {
      if (!CommandPayloadSchemas[cmd]) missing.push(cmd);
    }
    expect(missing).toEqual([]);
  });
});
