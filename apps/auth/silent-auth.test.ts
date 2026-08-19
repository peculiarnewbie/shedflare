import { describe, expect, test } from "vite-plus/test";
import { validateSilentAuthRequest } from "./src/worker";

const env = {
  ALLOWED_CLIENTS: JSON.stringify({
    "shedflare-drive": ["https://drive.example.com"],
  }),
};

function authorizationRequest(params: Record<string, string>) {
  const url = new URL("https://auth.example.com/authorize");
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return new Request(url);
}

describe("silent authorization validation", () => {
  test("returns a local 400 instead of redirecting an invalid client", async () => {
    const result = validateSilentAuthRequest(
      authorizationRequest({
        auto: "1",
        response_type: "code",
        client_id: "attacker",
        redirect_uri: "https://evil.example/api/auth/callback",
      }),
      env,
    );

    expect(result.kind).toBe("reject");
    if (result.kind !== "reject") throw new Error("Expected rejected silent authorization");
    expect(result.response.status).toBe(400);
    expect(result.response.headers.get("location")).toBeNull();
    expect(await result.response.text()).toContain("Invalid OAuth client");
  });

  test("accepts only the registered callback path", () => {
    const result = validateSilentAuthRequest(
      authorizationRequest({
        auto: "1",
        response_type: "code",
        client_id: "shedflare-drive",
        redirect_uri: "https://drive.example.com/api/auth/callback",
        state: "state-123",
      }),
      env,
    );

    expect(result).toMatchObject({
      kind: "valid",
      clientId: "shedflare-drive",
      state: "state-123",
    });
  });
});
