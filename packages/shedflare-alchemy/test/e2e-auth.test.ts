import { describe, expect, test } from "vite-plus/test";
import { resolveE2eAuthBindings } from "../src/e2e-auth";

describe("resolveE2eAuthBindings", () => {
  test("returns bindings only for a complete E2E-stage configuration", () => {
    expect(
      resolveE2eAuthBindings({
        stage: "e2e-drive-123",
        appId: "drive",
        email: "owner@example.com",
        token: "secret",
      }),
    ).toEqual({ E2E_AUTH_EMAIL: "owner@example.com", E2E_AUTH_TOKEN: "secret" });
  });

  test("rejects E2E credentials in production", () => {
    expect(() =>
      resolveE2eAuthBindings({
        stage: "prod",
        appId: "money",
        email: "owner@example.com",
        token: "secret",
      }),
    ).toThrow("forbidden");
  });

  test("rejects partial credentials", () => {
    expect(() =>
      resolveE2eAuthBindings({ stage: "e2e-money-123", appId: "money", token: "secret" }),
    ).toThrow("requires both");
  });
});
