import { describe, expect, test, vi, beforeEach, afterEach } from "vite-plus/test";
import * as Redacted from "effect/Redacted";
import {
  deleteWorkerSecret,
  listWorkerSecretNames,
  putWorkerSecret,
  type CfCredentials,
} from "../src/cf-secrets-api.ts";

const credentials = {
  type: "apiToken",
  apiToken: Redacted.make("test-token"),
  accountId: "acct-1",
} satisfies CfCredentials;

describe("cf-secrets-api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("listWorkerSecretNames returns binding names", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        result: [{ name: "API_KEY" }, { name: "OTHER" }],
      }),
    });

    const names = await listWorkerSecretNames(credentials, "acct-1", "shedflare-dev-chat");
    expect(names).toEqual(["API_KEY", "OTHER"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/acct-1/workers/scripts/shedflare-dev-chat/secrets",
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("putWorkerSecret sends secret_text body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, result: null }),
    });

    await putWorkerSecret(credentials, "acct-1", "worker", "API_KEY", "secret-value");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/secrets"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "API_KEY", text: "secret-value", type: "secret_text" }),
      }),
    );
  });

  test("deleteWorkerSecret ignores 404", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ success: false, errors: [{ message: "not found" }] }),
    });

    await expect(
      deleteWorkerSecret(credentials, "acct-1", "worker", "API_KEY"),
    ).resolves.toBeUndefined();
  });
});
