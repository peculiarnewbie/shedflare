import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appStackConfig, stageSubdomain, type ShedflareAlchemyConfig } from "../src/config";
import { loadDotEnvFile, parseDotEnv } from "../src/dotenv";
import { createManifestCatalog, parseManifest } from "@shedflare/core";

function manifest(
  id: string,
  options: {
    vars?: Record<string, { from: "user"; description: string; default?: string }>;
  } = {},
) {
  return parseManifest(
    {
      id,
      name: `Shedflare ${id}`,
      description: `Description for ${id}`,
      lifecycle: "experimental",
      category: "productivity",
      dataSensitivity: "personal",
      dependsOn: [],
      defaultSubdomain: id,
      vars: options.vars ?? {},
      secrets: {},
      resources: [],
    },
    `fixture:${id}`,
  );
}

const catalog = createManifestCatalog([
  {
    manifest: manifest("chat", {
      vars: {
        DEFAULT_MODEL_ID: {
          from: "user",
          description: "Default model",
          default: "auto",
        },
      },
    }),
  },
  { manifest: manifest("money") },
]);

const config: ShedflareAlchemyConfig = {
  domain: "peculiarnewbie.com",
  ownerEmail: "owner@example.com",
  apps: {
    chat: { enabled: true, subdomain: "chat" },
    money: { enabled: true, subdomain: "money" },
  },
  vars: {
    chat: { DEFAULT_MODEL_ID: "auto" },
  },
};

describe("stageSubdomain", () => {
  test("keeps production subdomains unchanged", () => {
    expect(stageSubdomain("chat", "prod")).toBe("chat");
  });

  test("suffixes non-production subdomains", () => {
    expect(stageSubdomain("chat", "dev-bolt")).toBe("chat-dev-bolt");
    expect(stageSubdomain("chat", "Dev Bolt")).toBe("chat-dev-bolt");
  });
});

describe("dotenv loading", () => {
  test("parses common .env syntax", () => {
    expect(
      parseDotEnv(`
        # comment
        OPENCODE_GO_API_KEY=plain
        export CF_API_TOKEN="quoted"
        SINGLE='single quoted'
        ESCAPED="line one\\nline two\\t\\"quoted\\""
        COMMENTED=value # explanation
      `),
    ).toEqual({
      OPENCODE_GO_API_KEY: "plain",
      CF_API_TOKEN: "quoted",
      SINGLE: "single quoted",
      ESCAPED: 'line one\nline two\t"quoted"',
      COMMENTED: "value",
    });
  });

  test("loads values without overwriting exported environment", () => {
    const dir = mkdtempSync(join(tmpdir(), "shedflare-alchemy-env-"));
    const file = join(dir, ".env");
    const originalKey = process.env.OPENCODE_GO_API_KEY;
    const originalToken = process.env.CF_API_TOKEN;

    try {
      process.env.OPENCODE_GO_API_KEY = "exported";
      delete process.env.CF_API_TOKEN;
      writeFileSync(file, "OPENCODE_GO_API_KEY=file\nCF_API_TOKEN=file-token\n");

      loadDotEnvFile(file);

      expect(process.env.OPENCODE_GO_API_KEY).toBe("exported");
      expect(process.env.CF_API_TOKEN).toBe("file-token");
    } finally {
      if (originalKey === undefined) delete process.env.OPENCODE_GO_API_KEY;
      else process.env.OPENCODE_GO_API_KEY = originalKey;
      if (originalToken === undefined) delete process.env.CF_API_TOKEN;
      else process.env.CF_API_TOKEN = originalToken;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("appStackConfig", () => {
  test("uses configured subdomains in production", () => {
    expect(appStackConfig(config, "chat", "prod", catalog)).toMatchObject({
      subdomain: "chat",
      configuredSubdomain: "chat",
      url: "https://chat.peculiarnewbie.com",
    });
  });

  test("derives non-production subdomains from the stage", () => {
    expect(appStackConfig(config, "chat", "dev-bolt", catalog)).toMatchObject({
      subdomain: "chat-dev-bolt",
      configuredSubdomain: "chat",
      url: "https://chat-dev-bolt.peculiarnewbie.com",
    });
  });

  test("resolves sparse version 2 config using manifest defaults", () => {
    const versionTwoConfig = {
      configVersion: 2 as const,
      domain: "peculiarnewbie.com",
      ownerEmail: "owner@example.com",
      apps: { chat: {} },
    };

    expect(appStackConfig(versionTwoConfig, "chat", "prod", catalog)).toMatchObject({
      subdomain: "chat",
      configuredSubdomain: "chat",
      vars: { DEFAULT_MODEL_ID: "auto" },
    });
  });
});
