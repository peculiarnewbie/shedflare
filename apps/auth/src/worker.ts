import { issuer } from "@openauthjs/openauth";
import { GoogleOidcProvider } from "@openauthjs/openauth/provider/google";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { createSubjects } from "@openauthjs/openauth/subject";
import { importPKCS8, SignJWT } from "jose";
import {
  array,
  boolean,
  literal,
  number,
  object,
  optional,
  record,
  safeParse,
  string,
  union,
  type InferOutput,
} from "valibot";

export type Env = {
  APP_PUBLIC_URL: string;
  GOOGLE_CLIENT_ID: string;
  OWNER_EMAIL: string;
  ALLOWED_CLIENTS: string;
  OPENAUTH_STORAGE: KVNamespace;
};

const GoogleOidcClaimsSchema = object({
  email: optional(string()),
  email_verified: optional(boolean()),
});
const AllowedClientsSchema = record(string(), array(string()));
const SessionSchema = object({ email: string() });
const TokenTtlSchema = object({ access: number(), refresh: number() });
const SilentTokenEntrySchema = object({
  source: literal("shedflare:silent-auth"),
  subject: string(),
  properties: object({ email: string() }),
  redirectURI: optional(string()),
  clientID: optional(string()),
  pkce: optional(object({ challenge: string(), method: string() })),
  ttl: optional(TokenTtlSchema),
});
const SigningKeySchema = object({
  id: string(),
  privateKey: string(),
  alg: string(),
  created: optional(union([number(), string()])),
});
type SigningKey = InferOutput<typeof SigningKeySchema>;

const subjects = createSubjects({
  user: object({
    email: string(),
  }),
});

const SESSION_COOKIE = "sf_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const CODE_TTL = 60; // 60 seconds

function serializeCookie(name: string, value: string, maxAge?: number) {
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;
  cookie += "; Path=/; HttpOnly; SameSite=Lax";
  return cookie;
}

function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE, "", 0);
}

function renderAuthHome(opts: { email: string | null; appOrigins: string[] }): string {
  const { email, appOrigins } = opts;
  const apps = [...new Set(appOrigins)]
    .sort()
    .map(
      (origin) =>
        `<a class="app-link" href="${origin}" target="_blank" rel="noreferrer">${origin.replace(/^https?:\/\//, "")}</a>`,
    )
    .join("");

  const body = email
    ? `
    <div class="card">
      <p class="eyebrow">Signed in</p>
      <h1 class="title">${email}</h1>
      <p class="sub">Your session is active on this auth domain. Signing out revokes it everywhere — apps will ask you to sign in again on your next visit.</p>
      <form method="post" action="/logout?returnTo=/">
        <button class="btn btn-danger" type="submit">Sign out</button>
      </form>
    </div>`
    : `
    <div class="card">
      <p class="eyebrow">Not signed in</p>
      <h1 class="title">Shedflare Auth</h1>
      <p class="sub">No active session on this auth domain. Open any app below and sign in with Google — it will establish a session here too.</p>
      ${apps ? `<div class="apps">${apps}</div>` : ""}
    </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Shedflare Auth</title>
<style>
  :root {
    --bg: #0f1117;
    --panel: #1a1d27;
    --text: #e4e4e8;
    --text-secondary: #7f8394;
    --line: rgba(255, 255, 255, 0.06);
    --accent: #2dd4a8;
    --danger: #e5484d;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 24px;
  }
  .card {
    width: min(420px, 100%);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .eyebrow {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .title { font-size: 1.5rem; font-weight: 700; word-break: break-word; }
  .sub { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; }
  .apps { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .app-link {
    display: block;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--text);
    font-size: 0.9rem;
    text-decoration: none;
  }
  .app-link:hover { border-color: var(--accent); }
  .btn {
    margin-top: 8px;
    padding: 10px 16px;
    border: none;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-danger:hover { opacity: 0.9; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function validateReturnTo(input: string | null): string | null {
  if (input === null) return null;
  // Decode first, then validate: validating the still-encoded form lets
  // `/%2Fevil` slip through (it isn't "//…" until decoded), which becomes a
  // protocol-relative open redirect when used directly as a Location below.
  let decoded: string;
  try {
    decoded = decodeURIComponent(input.trim());
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.startsWith("/api/")) {
    return null;
  }
  return decoded;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

let parsedAllowedClients: { source: string; clients: Map<string, string[]> } | null = null;

function getAllowedClients(env: Pick<Env, "ALLOWED_CLIENTS">): Map<string, string[]> {
  if (parsedAllowedClients?.source === env.ALLOWED_CLIENTS) return parsedAllowedClients.clients;
  const clients = new Map<string, string[]>();
  try {
    const parsed = safeParse(AllowedClientsSchema, JSON.parse(env.ALLOWED_CLIENTS));
    if (parsed.success) {
      for (const [clientId, origins] of Object.entries(parsed.output)) {
        clients.set(clientId, origins);
      }
    }
  } catch {
    // Empty map — all client validation will fail
  }
  parsedAllowedClients = { source: env.ALLOWED_CLIENTS, clients };
  return clients;
}

function validateClientAndRedirectURI(
  env: Pick<Env, "ALLOWED_CLIENTS">,
  clientId: string,
  redirectURI: string,
): boolean {
  const allowed = getAllowedClients(env);
  const origins = allowed.get(clientId);
  if (!origins) return false;
  try {
    const origin = new URL(redirectURI).origin;
    return origins.includes(origin);
  } catch {
    return false;
  }
}

function isValidRedirectPath(redirectURI: string): boolean {
  try {
    return new URL(redirectURI).pathname === "/api/auth/callback";
  } catch {
    return false;
  }
}

type SilentAuthValidation =
  | { readonly kind: "skip" }
  | { readonly kind: "reject"; readonly response: Response }
  | {
      readonly kind: "valid";
      readonly redirectURI: string;
      readonly clientId: string;
      readonly state: string | null;
      readonly codeChallenge: string | null;
      readonly codeChallengeMethod: string | null;
    };

export function validateSilentAuthRequest(
  request: Request,
  env: Pick<Env, "ALLOWED_CLIENTS">,
): SilentAuthValidation {
  const url = new URL(request.url);
  if (url.searchParams.get("auto") !== "1") return { kind: "skip" };

  const redirectURI = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id");
  if (!redirectURI || responseType !== "code" || !clientId) return { kind: "skip" };

  if (
    !validateClientAndRedirectURI(env, clientId, redirectURI) ||
    !isValidRedirectPath(redirectURI)
  ) {
    return {
      kind: "reject",
      response: new Response("Invalid OAuth client or redirect URI.", {
        status: 400,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    };
  }

  return {
    kind: "valid",
    redirectURI,
    clientId,
    state: url.searchParams.get("state"),
    codeChallenge: url.searchParams.get("code_challenge"),
    codeChallengeMethod: url.searchParams.get("code_challenge_method"),
  };
}

async function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  _method: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const computed = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return computed === codeChallenge;
}

function createIssuer(env: Env) {
  return issuer({
    providers: {
      google: GoogleOidcProvider({
        clientID: env.GOOGLE_CLIENT_ID,
        scopes: ["email", "profile"],
      }),
    },
    subjects,
    // SAFETY: OpenAuth bundles an older Workers KV declaration; the runtime binding implements
    // the same get/put/delete/list contract but is nominally incompatible with current CF types.
    storage: CloudflareStorage({ namespace: env.OPENAUTH_STORAGE as any }),
    ttl: {
      access: 60 * 60 * 24 * 365,
      refresh: 60 * 60 * 24 * 365,
      reuse: 60 * 60 * 24,
      retention: 60 * 60 * 24 * 7,
    },
    success: async (ctx, value) => {
      if (value.provider !== "google") return new Response("Invalid provider", { status: 400 });
      const claims = safeParse(GoogleOidcClaimsSchema, value.id);
      if (!claims.success || !claims.output.email || claims.output.email_verified === false) {
        return new Response("No verified email from Google", { status: 400 });
      }
      if (normalizeEmail(claims.output.email) !== normalizeEmail(env.OWNER_EMAIL)) {
        return Response.redirect(`${env.APP_PUBLIC_URL}/forbidden`, 302);
      }
      return ctx.subject("user", { email: claims.output.email });
    },
  });
}

let cachedIssuer: ReturnType<typeof createIssuer> | null = null;

function getIssuer(env: Env) {
  cachedIssuer ??= createIssuer(env);
  return cachedIssuer;
}

function isHttps(url: string) {
  return url.startsWith("https://");
}

let cachedSigningKey: SigningKey | null = null;

function createdMs(key: SigningKey) {
  const numeric = safeParse(number(), key.created);
  if (numeric.success) return numeric.output;
  const textual = safeParse(string(), key.created);
  if (textual.success) {
    const parsed = Date.parse(textual.output);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

async function getSigningKey(env: Env): Promise<SigningKey> {
  if (cachedSigningKey) return cachedSigningKey;
  const { keys } = await env.OPENAUTH_STORAGE.list({ prefix: "signing:key" });
  if (keys.length === 0) throw new Error("No signing keys found in storage");
  const signingKeys = (
    await Promise.all(keys.map((key) => env.OPENAUTH_STORAGE.get(key.name, "json")))
  ).flatMap((value) => {
    const parsed = safeParse(SigningKeySchema, value);
    return parsed.success ? [parsed.output] : [];
  });
  if (signingKeys.length === 0) throw new Error("No valid signing keys found in storage");
  signingKeys.sort((a, b) => createdMs(b) - createdMs(a));
  cachedSigningKey = signingKeys[0];
  return cachedSigningKey;
}

async function handleTokenExchange(request: Request, env: Env): Promise<Response | null> {
  const body = await request.clone().text();
  const params = new URLSearchParams(body);
  const grantType = params.get("grant_type");

  if (grantType === "authorization_code") {
    const code = params.get("code");
    const redirectURI = params.get("redirect_uri");
    const clientId = params.get("client_id");
    const codeVerifier = params.get("code_verifier");

    if (!code || !redirectURI || !clientId) return null;

    const codeEntry = safeParse(
      SilentTokenEntrySchema,
      await env.OPENAUTH_STORAGE.get(`oauth:code\x1f${code}`, "json"),
    );
    if (!codeEntry.success) return null;
    const entry = codeEntry.output;

    if (entry.redirectURI !== redirectURI || entry.clientID !== clientId) {
      return new Response("redirect_uri or client_id mismatch", { status: 400 });
    }

    if (entry.pkce) {
      if (!codeVerifier) {
        return new Response("code_verifier required", { status: 400 });
      }
      const valid = await verifyPKCE(codeVerifier, entry.pkce.challenge, entry.pkce.method);
      if (!valid) {
        return new Response("invalid code_verifier", { status: 400 });
      }
    }

    const ttl = entry.ttl?.access ?? 60 * 60 * 24 * 365;
    const signingKey = await getSigningKey(env);
    const privateKey = await importPKCS8(signingKey.privateKey, signingKey.alg);

    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({
      mode: "access",
      properties: entry.properties,
    })
      .setProtectedHeader({ alg: signingKey.alg, kid: signingKey.id, typ: "JWT" })
      .setIssuer(env.APP_PUBLIC_URL)
      .setSubject(entry.subject)
      .setIssuedAt(now)
      .setExpirationTime(now + ttl)
      .sign(privateKey);

    const refreshToken = crypto.randomUUID();

    await env.OPENAUTH_STORAGE.put(
      `oauth:refresh\x1f${entry.subject}\x1f${refreshToken}`,
      JSON.stringify({
        source: "shedflare:silent-auth",
        subject: entry.subject,
        properties: entry.properties,
        ttl: entry.ttl,
      }),
      { expirationTtl: ttl },
    );

    await env.OPENAUTH_STORAGE.delete(`oauth:code\x1f${code}`);

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: ttl,
        token_type: "bearer",
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token");
    if (!refreshToken) return null;

    const { keys } = await env.OPENAUTH_STORAGE.list({ prefix: "oauth:refresh" });
    for (const key of keys) {
      const data = safeParse(
        SilentTokenEntrySchema,
        await env.OPENAUTH_STORAGE.get(key.name, "json"),
      );
      if (!data.success) continue;
      const entry = data.output;
      if (!key.name.endsWith(`\x1f${refreshToken}`)) continue;

      const ttl = entry.ttl?.access ?? 60 * 60 * 24 * 365;
      const signingKey = await getSigningKey(env);
      const privateKey = await importPKCS8(signingKey.privateKey, signingKey.alg);

      const now = Math.floor(Date.now() / 1000);
      const accessToken = await new SignJWT({
        mode: "access",
        properties: entry.properties,
      })
        .setProtectedHeader({ alg: signingKey.alg, kid: signingKey.id, typ: "JWT" })
        .setIssuer(env.APP_PUBLIC_URL)
        .setSubject(entry.subject)
        .setIssuedAt(now)
        .setExpirationTime(now + ttl)
        .sign(privateKey);

      const newRefreshToken = crypto.randomUUID();
      await env.OPENAUTH_STORAGE.delete(key.name);
      await env.OPENAUTH_STORAGE.put(
        `oauth:refresh\x1f${entry.subject}\x1f${newRefreshToken}`,
        JSON.stringify({
          source: "shedflare:silent-auth",
          subject: entry.subject,
          properties: entry.properties,
          ttl: entry.ttl,
        }),
        { expirationTtl: ttl },
      );

      return new Response(
        JSON.stringify({
          access_token: accessToken,
          refresh_token: newRefreshToken,
          expires_in: ttl,
          token_type: "bearer",
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
  }

  return null;
}

async function handleSilentAuth(request: Request, env: Env): Promise<Response | null> {
  const validation = validateSilentAuthRequest(request, env);
  if (validation.kind === "skip") return null;
  if (validation.kind === "reject") return validation.response;
  const { redirectURI, clientId, state, codeChallenge, codeChallengeMethod } = validation;

  const sessionId = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!sessionId) {
    if (redirectURI) {
      const location = new URL(redirectURI);
      location.searchParams.set("error", "no_session");
      return Response.redirect(location.toString(), 302);
    }
    return null;
  }

  const session = safeParse(
    SessionSchema,
    await env.OPENAUTH_STORAGE.get(`session:${sessionId}`, "json"),
  );
  if (!session.success) {
    if (redirectURI) {
      const location = new URL(redirectURI);
      location.searchParams.set("error", "no_session");
      const headers = new Headers({ Location: location.toString() });
      headers.append("Set-Cookie", clearSessionCookie());
      return new Response(null, { status: 302, headers });
    }
    return null;
  }

  const code = crypto.randomUUID();
  const email = session.output.email;
  const subject = `user:${email}`;

  await env.OPENAUTH_STORAGE.put(
    `oauth:code\x1f${code}`,
    JSON.stringify({
      source: "shedflare:silent-auth",
      subject,
      type: "user",
      properties: { email },
      redirectURI,
      clientID: clientId,
      pkce:
        codeChallenge && codeChallengeMethod
          ? { challenge: codeChallenge, method: codeChallengeMethod }
          : undefined,
      ttl: { access: 60 * 60 * 24 * 365, refresh: 60 * 60 * 24 * 365 },
    }),
    { expirationTtl: CODE_TTL },
  );

  const location = new URL(redirectURI);
  location.searchParams.set("code", code);
  if (state) location.searchParams.set("state", state);

  return Response.redirect(location.toString(), 302);
}

async function handleCallbackSession(response: Response, env: Env): Promise<Response> {
  const location = response.headers.get("location");
  if (!location || response.status !== 302) return response;

  const codeMatch = new URL(location, env.APP_PUBLIC_URL).searchParams.get("code");
  if (!codeMatch) return response;

  const sessionId = crypto.randomUUID();
  const codeEntry = safeParse(
    SilentTokenEntrySchema,
    await env.OPENAUTH_STORAGE.get(`oauth:code\x1f${codeMatch}`, "json"),
  );
  if (!codeEntry.success) return response;

  const email = codeEntry.output.properties.email;
  await env.OPENAUTH_STORAGE.put(`session:${sessionId}`, JSON.stringify({ email }), {
    expirationTtl: SESSION_TTL,
  });

  const headers = new Headers(response.headers);
  const secure = isHttps(env.APP_PUBLIC_URL) ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}${secure}`,
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      const sessionId = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
      let email: string | null = null;
      if (sessionId) {
        const session = safeParse(
          SessionSchema,
          await env.OPENAUTH_STORAGE.get(`session:${sessionId}`, "json"),
        );
        if (session.success) email = session.output.email;
      }
      const appOrigins = [...getAllowedClients(env).values()].flat();
      return new Response(renderAuthHome({ email, appOrigins }), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (url.pathname === "/forbidden") {
      return new Response("This Google account is not allowed for this Shedflare install.", {
        status: 403,
      });
    }

    if (url.pathname === "/logout" && request.method === "POST") {
      const returnTo = validateReturnTo(url.searchParams.get("returnTo")) ?? "/";
      const sessionId = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
      if (sessionId) {
        await env.OPENAUTH_STORAGE.delete(`session:${sessionId}`);
      }
      const headers = new Headers({ Location: returnTo });
      headers.append("Set-Cookie", clearSessionCookie());
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === "/authorize") {
      const silent = await handleSilentAuth(request, env);
      if (silent) return silent;
    }

    if (url.pathname === "/token" && request.method === "POST") {
      const customResponse = await handleTokenExchange(request, env);
      if (customResponse) return customResponse;
    }

    const response = await getIssuer(env).fetch(request, env, ctx);

    if (url.pathname.match(/^\/[^/]+\/callback$/)) {
      return handleCallbackSession(response, env);
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
