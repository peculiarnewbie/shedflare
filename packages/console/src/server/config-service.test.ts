import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  formatConfig,
  mergeConfigPatch,
  validateConfigPatch,
  writeConfigFile,
  type ShedflareConfig,
} from "./config-service";

const baseConfig: ShedflareConfig = {
  domain: "example.com",
  ownerEmail: "owner@example.com",
  apps: {
    auth: { enabled: true, subdomain: "auth" },
    chat: { enabled: false, subdomain: "chat" },
  },
  vars: {
    chat: { DEFAULT_MODEL_ID: "auto" },
  },
  resources: {
    chat: { BUCKET: "shedflare-chat" },
  },
};

describe("validateConfigPatch", () => {
  test("accepts editable config fields and normalizes host labels", () => {
    expect(
      validateConfigPatch({
        domain: "Shedflare.EXAMPLE",
        ownerEmail: "owner@example.com",
        apps: {
          chat: { enabled: true, subdomain: "Chat" },
        },
        vars: {
          chat: { DEFAULT_MODEL_ID: "auto", EMPTY_ALLOWED: "" },
        },
      }),
    ).toEqual({
      domain: "shedflare.example",
      ownerEmail: "owner@example.com",
      apps: {
        chat: { enabled: true, subdomain: "chat" },
      },
      vars: {
        chat: { DEFAULT_MODEL_ID: "auto", EMPTY_ALLOWED: "" },
      },
    });
  });

  test("rejects invalid subdomains and non-string vars", () => {
    expect(() => validateConfigPatch({ apps: { chat: { subdomain: "-bad" } } })).toThrow(
      "subdomain cannot start or end with a hyphen",
    );
    expect(() => validateConfigPatch({ vars: { chat: { DEFAULT_MODEL_ID: 123 } } })).toThrow(
      'var "DEFAULT_MODEL_ID" must be a string',
    );
  });
});

describe("mergeConfigPatch", () => {
  test("updates apps and vars without dropping unrelated config", () => {
    const next = mergeConfigPatch(baseConfig, {
      apps: {
        chat: { enabled: true, subdomain: "ai" },
      },
      vars: {
        chat: { DEFAULT_MODEL_ID: "gpt-5" },
      },
    });

    expect(next).toEqual({
      ...baseConfig,
      apps: {
        auth: { enabled: true, subdomain: "auth" },
        chat: { enabled: true, subdomain: "ai" },
      },
      vars: {
        chat: { DEFAULT_MODEL_ID: "gpt-5" },
      },
    });
    expect(next.resources).toEqual(baseConfig.resources);
  });
});

describe("writeConfigFile", () => {
  test("writes the formatted config JSON to the requested file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shedflare-console-"));
    const file = path.join(dir, "shedflare.config.jsonc");

    writeConfigFile(file, baseConfig);

    expect(readFileSync(file, "utf8")).toBe(formatConfig(baseConfig));
  });
});
