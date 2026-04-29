import { expect, test } from "vite-plus/test";
import { resolveVars, resolveSecrets, mergeWranglerConfig } from "./template.js";
import { BUILTIN_MANIFESTS } from "./manifests-data.js";
import type { AppManifest, AppId } from "./manifests.js";
import type { ShedflareConfig } from "./config.js";

const baseConfig: ShedflareConfig = {
  domain: "example.com",
  ownerEmail: "me@example.com",
  apps: {
    auth: { enabled: true, subdomain: "auth" },
    chat: { enabled: true, subdomain: "chat" },
    drive: { enabled: true, subdomain: "drive" },
  },
  vars: {
    chat: { DEFAULT_MODEL_ID: "gpt-4" },
  },
  resources: {
    auth: { OPENAUTH_STORAGE_ID: "kv-id-123" },
    chat: {},
    drive: { DB_ID: "d1-id-456" },
  },
};

const manifests = BUILTIN_MANIFESTS as Record<AppId, AppManifest>;

test("resolveVars resolves url type", () => {
  const vars = resolveVars("auth", manifests.auth, baseConfig, manifests);
  expect(vars.APP_PUBLIC_URL).toBe("https://auth.example.com");
});

test("resolveVars resolves appUrl type to another app", () => {
  const vars = resolveVars("chat", manifests.chat, baseConfig, manifests);
  expect(vars.AUTH_ISSUER_URL).toBe("https://auth.example.com");
});

test("resolveVars resolves appId type", () => {
  const vars = resolveVars("chat", manifests.chat, baseConfig, manifests);
  expect(vars.AUTH_CLIENT_ID).toBe("shedflare-chat");
});

test("resolveVars resolves ownerEmail type", () => {
  const vars = resolveVars("auth", manifests.auth, baseConfig, manifests);
  expect(vars.OWNER_EMAIL).toBe("me@example.com");
});

test("resolveVars resolves user type from config vars", () => {
  const vars = resolveVars("chat", manifests.chat, baseConfig, manifests);
  expect(vars.DEFAULT_MODEL_ID).toBe("gpt-4");
});

test("resolveVars falls back to default for user type", () => {
  const configNoVars: ShedflareConfig = {
    ...baseConfig,
    vars: {},
  };
  const vars = resolveVars("chat", manifests.chat, configNoVars, manifests);
  expect(vars.DEFAULT_MODEL_ID).toBe("auto");
});

test("resolveSecrets returns required secret keys", () => {
  const required = resolveSecrets(manifests.chat);
  expect(required).toContain("OPENCODE_GO_API_KEY");
  expect(required).toContain("UPLOAD_TOKEN_SECRET");
});

test("resolveSecrets returns empty for apps without secrets", () => {
  const required = resolveSecrets(manifests.auth);
  expect(required).toEqual([]);
});

test("mergeWranglerConfig produces expected structure", () => {
  const base = { name: "shedflare-test", main: "src/worker.ts" };
  const result = mergeWranglerConfig(
    base,
    "auth",
    manifests.auth,
    baseConfig,
    manifests,
    baseConfig.resources as Record<AppId, Record<string, string>>,
  ) as Record<string, unknown>;

  expect(result.name).toBe("shedflare-test");
  expect(result.vars).toBeDefined();
  expect((result.vars as Record<string, string>).APP_PUBLIC_URL).toBe("https://auth.example.com");
  const routes = result.routes as Array<Record<string, string>>;
  expect(routes).toBeDefined();
  expect(routes).toHaveLength(1);
  expect(routes[0].pattern).toBe("auth.example.com");
});

test("mergeWranglerConfig merges resource IDs into base config", () => {
  const base = {
    name: "shedflare-auth",
    kv_namespaces: [{ binding: "OPENAUTH_STORAGE" }],
  };
  const result = mergeWranglerConfig(
    base,
    "auth",
    manifests.auth,
    baseConfig,
    manifests,
    baseConfig.resources as Record<AppId, Record<string, string>>,
  );

  const r = result as Record<string, unknown>;
  expect(r.kv_namespaces).toBeDefined();
  expect((r.kv_namespaces as Array<Record<string, string>>)[0].id).toBe("kv-id-123");
});
