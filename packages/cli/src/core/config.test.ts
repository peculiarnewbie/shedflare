import { expect, test } from "vite-plus/test";
import { validateConfig } from "./config.js";

test("validateConfig passes with valid config", () => {
  const config = {
    domain: "example.com",
    ownerEmail: "me@example.com",
    apps: {
      auth: { enabled: true, subdomain: "auth" },
      chat: { enabled: true, subdomain: "chat" },
    },
    vars: {},
    resources: {},
  };
  const result = validateConfig(config);
  expect(result.success).toBe(true);
});

test("validateConfig accepts optional enabled field", () => {
  const config = {
    domain: "example.com",
    ownerEmail: "me@example.com",
    apps: {
      auth: { enabled: false, subdomain: "auth" },
      chat: { subdomain: "chat" },
    },
    vars: {},
    resources: {},
  };
  const result = validateConfig(config);
  expect(result.success).toBe(true);
});

test("validateConfig fails with missing domain", () => {
  const config = {
    ownerEmail: "me@example.com",
    apps: { auth: { subdomain: "auth" } },
    vars: {},
    resources: {},
  };
  const result = validateConfig(config);
  expect(result.success).toBe(false);
});

test("validateConfig fails with missing ownerEmail", () => {
  const config = {
    domain: "example.com",
    apps: { auth: { subdomain: "auth" } },
    vars: {},
    resources: {},
  };
  const result = validateConfig(config);
  expect(result.success).toBe(false);
});

test("validateConfig fails with unknown app ID", () => {
  const config = {
    domain: "example.com",
    ownerEmail: "me@example.com",
    apps: {
      auth: { subdomain: "auth" },
      unknown: { subdomain: "bad" },
    },
    vars: {},
    resources: {},
  };
  const result = validateConfig(config);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toContain("Unknown app");
  }
});
