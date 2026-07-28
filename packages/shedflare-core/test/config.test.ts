import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  CoreError,
  discoverManifests,
  loadConfig,
  migrateConfig,
  patchConfig,
  resolveAppConfig,
  validateConfig,
  writeConfigMigration,
} from "../src/index.ts";

const root = join(import.meta.dirname, "../../..");
const catalog = discoverManifests(root);
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const temporaryRoot of temporaryRoots.splice(0)) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

function temporaryRoot(): string {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "shedflare-config-"));
  temporaryRoots.push(temporaryRoot);
  return temporaryRoot;
}

const legacyConfig = {
  domain: "example.com",
  ownerEmail: "owner@example.com",
  apps: {
    auth: { enabled: true, subdomain: "auth" },
    chat: { enabled: true, subdomain: "ai" },
    drive: { enabled: false, subdomain: "drive" },
  },
  vars: {
    chat: { DEFAULT_MODEL_ID: "gpt-5" },
  },
  resources: {},
};

describe("config validation and resolution", () => {
  test("keeps version 1 readable without mutating the input", () => {
    const input = structuredClone(legacyConfig);
    const config = validateConfig(input, catalog);

    expect(config.configVersion).toBe(1);
    expect(input).toEqual(legacyConfig);
    expect(resolveAppConfig(config, catalog, "chat", "dev-bolt")).toMatchObject({
      configuredSubdomain: "ai",
      stageSubdomain: "ai-dev-bolt",
      url: "https://ai-dev-bolt.example.com",
      vars: { DEFAULT_MODEL_ID: "gpt-5" },
    });
  });

  test("resolves sparse version 2 app defaults", () => {
    const config = validateConfig(
      {
        configVersion: 2,
        domain: "example.com",
        ownerEmail: "owner@example.com",
        apps: { chat: {}, drive: {} },
      },
      catalog,
    );

    expect(resolveAppConfig(config, catalog, "chat")).toMatchObject({
      configuredSubdomain: "chat",
      stageSubdomain: "chat",
      vars: { DEFAULT_MODEL_ID: "auto" },
    });
  });

  test("rejects future versions, unknown apps, and unknown fields", () => {
    for (const input of [
      { ...legacyConfig, configVersion: 3 },
      { ...legacyConfig, apps: { unknown: { enabled: true, subdomain: "unknown" } } },
      { ...legacyConfig, ignored: true },
    ]) {
      expect(() => validateConfig(input, catalog)).toThrow(CoreError);
    }
  });
});

describe("config migration", () => {
  test("migrates selected version 1 apps deterministically to sparse version 2", () => {
    const config = validateConfig(legacyConfig, catalog);
    const migration = migrateConfig(config, catalog);

    expect(migration).toMatchObject({ oldVersion: 1, canWrite: true, warnings: [] });
    expect(migration.config).toEqual({
      $schema: "./packages/shedflare-core/schemas/shedflare-config.schema.json",
      configVersion: 2,
      domain: "example.com",
      ownerEmail: "owner@example.com",
      apps: {
        auth: {},
        chat: { subdomain: "ai", vars: { DEFAULT_MODEL_ID: "gpt-5" } },
      },
    });
    expect(migrateConfig(migration.config, catalog).config).toEqual(migration.config);
  });

  test("blocks writes that would discard nonempty legacy resource state", () => {
    const config = validateConfig(
      { ...legacyConfig, resources: { chat: { BUCKET: "shedflare-chat" } } },
      catalog,
    );
    const migration = migrateConfig(config, catalog);

    expect(migration.canWrite).toBe(false);
    expect(migration.warnings[0]?.code).toBe("LEGACY_RESOURCES_PRESENT");
    expect(() => writeConfigMigration(migration, catalog)).toThrow("will not be discarded");
  });

  test("writes an explicit migration atomically with a local backup", () => {
    const tempRoot = temporaryRoot();
    const path = join(tempRoot, "shedflare.config.jsonc");
    const source = `${JSON.stringify(legacyConfig, null, 2)}\n`;
    writeFileSync(path, source);
    const migration = migrateConfig(validateConfig(legacyConfig, catalog), catalog, path, source);

    writeConfigMigration(migration, catalog);

    expect(loadConfig(tempRoot, catalog)).toEqual(migration.config);
    const backups = readdirSync(tempRoot).filter((file) => file.endsWith(".bak"));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(tempRoot, backups[0]), "utf8")).toBe(source);
  });
});

describe("comment-preserving patches", () => {
  test("preserves comments while applying a sparse config update", () => {
    const tempRoot = temporaryRoot();
    const path = join(tempRoot, "shedflare.config.jsonc");
    writeFileSync(
      path,
      `{
  // The deployment domain stays documented.
  "configVersion": 2,
  "domain": "example.com",
  "ownerEmail": "owner@example.com",
  "apps": {
    // Chat is selected for daily use.
    "chat": {
      "vars": {
        "DEFAULT_MODEL_ID": "auto"
      }
    }
  }
}
`,
    );

    const config = patchConfig(
      tempRoot,
      { apps: { chat: { subdomain: "ai", vars: { DEFAULT_MODEL_ID: "gpt-5" } } } },
      catalog,
    );
    const result = readFileSync(path, "utf8");

    expect(config.apps.chat).toEqual({
      subdomain: "ai",
      vars: { DEFAULT_MODEL_ID: "gpt-5" },
    });
    expect(result).toContain("// The deployment domain stays documented.");
    expect(result).toContain("// Chat is selected for daily use.");
  });
});
