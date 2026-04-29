import { expect, test, vi, beforeEach } from "vitest";
import { provisionResources } from "./provision.js";
import type { InitPlan } from "./init-draft.js";
import type { AppManifest } from "./manifests.js";

vi.mock("./wrangler.js", () => ({
  createKv: vi.fn(() => Promise.resolve({ id: "new-kv-id" })),
  createD1: vi.fn(() => Promise.resolve({ uuid: "new-d1-uuid" })),
  createR2: vi.fn(() => Promise.resolve()),
}));

import * as wrangler from "./wrangler.js";

beforeEach(() => {
  vi.clearAllMocks();
});

function makePlan(overrides: Partial<InitPlan> = {}): InitPlan {
  const authManifest: AppManifest = {
    id: "auth",
    name: "Auth",
    description: "",
    dependsOn: [],
    defaultSubdomain: "auth",
    vars: {},
    secrets: {},
    resources: [{ type: "kv", binding: "KV", name: "test-kv", idField: "KV_ID" }],
  };

  return {
    apps: [authManifest],
    deployOrder: ["auth"],
    urls: { auth: "https://auth.example.com" },
    resourceIds: {},
    resolvedVars: {},
    resolvedSecrets: {},
    mockResources: false,
    ...overrides,
  };
}

test("provisionResources creates missing KV resource", async () => {
  const plan = makePlan();
  const result = await provisionResources(plan);
  expect(result.resourceIds.auth.KV_ID).toBe("new-kv-id");
  expect(wrangler.createKv).toHaveBeenCalledWith("test-kv");
});

test("provisionResources skips existing resources", async () => {
  const plan = makePlan({
    resourceIds: { auth: { KV_ID: "existing-id" } },
  });
  const result = await provisionResources(plan);
  expect(result.resourceIds.auth.KV_ID).toBe("existing-id");
  expect(wrangler.createKv).not.toHaveBeenCalled();
});

test("provisionResources preserves existing IDs while creating missing ones", async () => {
  const authManifest: AppManifest = {
    id: "auth",
    name: "Auth",
    description: "",
    dependsOn: [],
    defaultSubdomain: "auth",
    vars: {},
    secrets: {},
    resources: [
      { type: "kv", binding: "KV", name: "test-kv", idField: "KV_ID" },
      { type: "d1", binding: "DB", name: "test-db", idField: "DB_ID" },
    ],
  };

  const plan: InitPlan = {
    apps: [authManifest],
    deployOrder: ["auth"],
    urls: { auth: "https://auth.example.com" },
    resourceIds: { auth: { KV_ID: "existing-kv" } },
    resolvedVars: {},
    resolvedSecrets: {},
    mockResources: false,
  };

  const result = await provisionResources(plan);
  expect(result.resourceIds.auth.KV_ID).toBe("existing-kv");
  expect(result.resourceIds.auth.DB_ID).toBe("new-d1-uuid");
  expect(wrangler.createKv).not.toHaveBeenCalled();
  expect(wrangler.createD1).toHaveBeenCalledWith("test-db");
});

test("provisionResources generates mock IDs in mock mode", async () => {
  const plan = makePlan({ mockResources: true });
  const result = await provisionResources(plan);
  expect(result.resourceIds.auth.KV_ID).toBeTruthy();
  expect(wrangler.createKv).not.toHaveBeenCalled();
});

test("provisionResources warns for browser resources", async () => {
  const authManifest: AppManifest = {
    id: "auth",
    name: "Auth",
    description: "",
    dependsOn: [],
    defaultSubdomain: "auth",
    vars: {},
    secrets: {},
    resources: [{ type: "browser", binding: "BROWSER", manualEnable: true }],
  };

  const plan: InitPlan = {
    apps: [authManifest],
    deployOrder: ["auth"],
    urls: { auth: "https://auth.example.com" },
    resourceIds: {},
    resolvedVars: {},
    resolvedSecrets: {},
    mockResources: false,
  };

  const result = await provisionResources(plan);
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(result.warnings[0]).toContain("Browser Automation");
});
