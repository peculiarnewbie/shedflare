import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { parseDotEnv } from "@shedflare/alchemy";
import {
  resolveSecretCommand,
  resolveSecretSetDestination,
  upsertDotEnvValue,
  writeLocalSecret,
} from "./secret.js";

describe("secret set destination", () => {
  test("defaults to the deployed Worker", () => {
    expect(resolveSecretSetDestination({})).toBe("remote");
  });

  test("requires local and both targets to be unambiguous", () => {
    expect(resolveSecretSetDestination({ local: true })).toBe("local");
    expect(resolveSecretSetDestination({ both: true })).toBe("both");
    expect(() => resolveSecretSetDestination({ local: true, both: true })).toThrow(
      "Choose either --local or --both",
    );
  });

  test("parses set and list as explicit actions", () => {
    expect(
      resolveSecretCommand({
        action: "set",
        app: "chat",
        name: "OPENCODE_GO_API_KEY",
        local: true,
      }),
    ).toEqual({
      action: "set",
      app: "chat",
      name: "OPENCODE_GO_API_KEY",
      destination: "local",
    });
    expect(resolveSecretCommand({ action: "list", app: "chat" })).toEqual({
      action: "list",
      app: "chat",
    });
  });

  test("rejects malformed and unknown secret actions", () => {
    expect(() => resolveSecretCommand({ action: "set", app: "chat" })).toThrow(
      "shedflare secret set <app> <name>",
    );
    expect(() => resolveSecretCommand({ action: "list", app: "chat", local: true })).toThrow(
      "shedflare secret list <app>",
    );
    expect(() => resolveSecretCommand({ action: "remove", app: "chat" })).toThrow(
      "Unknown secret action",
    );
  });
});

describe("local secret storage", () => {
  test("updates one assignment, removes duplicates, and preserves unrelated content", () => {
    const updated = upsertDotEnvValue(
      ["# local configuration", "OTHER=value", "export API_KEY=old", "API_KEY=stale", ""].join(
        "\n",
      ),
      "API_KEY",
      'new value with "quotes" and a\nnewline',
    );

    expect(updated).toContain("# local configuration\nOTHER=value\n");
    expect(updated.match(/^API_KEY=/gm)).toHaveLength(1);
    expect(parseDotEnv(updated)).toMatchObject({
      OTHER: "value",
      API_KEY: 'new value with "quotes" and a\nnewline',
    });
  });

  test("creates and updates a private .env file", () => {
    const directory = mkdtempSync(join(tmpdir(), "shedflare-secret-"));
    const filePath = join(directory, ".env");

    try {
      writeFileSync(filePath, "FIRST=one\n", { mode: 0o644 });
      writeLocalSecret({ filePath, name: "SECOND", value: "two" });

      expect(parseDotEnv(readFileSync(filePath, "utf8"))).toEqual({
        FIRST: "one",
        SECOND: "two",
      });
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
