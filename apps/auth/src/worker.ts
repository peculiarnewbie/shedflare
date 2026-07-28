import { issuer } from "@openauthjs/openauth";
import { GoogleOidcProvider } from "@openauthjs/openauth/provider/google";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { createSubjects } from "@openauthjs/openauth/subject";
import { importPKCS8, SignJWT } from "jose";
import { object, string } from "valibot";

type Env = {
  APP_PUBLIC_URL: string;
  GOOGLE_CLIENT_ID: string;
  OWNER_EMAIL: string;
  ALLOWED_CLIENTS: string;
  OPENAUTH_STORAGE: KVNamespace;
};

type GoogleOidcClaims = {
  email?: string;
  email_verified?: boolean;
};

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

function validateReturnTo(input: unknown): string | null {
  if (typeof input !== "string") return null;
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

let parsedAllowedClients: Map<string, string[]> | null = null;

function getAllowedClients(env: Env): Map<string, string[]> {
  if (parsedAllowedClients) return parsedAllowedClients;
  parsedAllowedClients = new Map();
  try {
    const raw = JSON.parse(env.ALLOWED_CLIENTS) as Record<string, string[]>;
    for (const [clientId, origins] of Object.entries(raw)) {
      if (Array.isArray(origins)) {
        parsedAllowedClients.set(clientId, origins);
      }
    }
  } catch {
    // Empty map — all client validation will fail
  }
  return parsedAllowedClients;
}

function validateClientAndRedirectURI(env: Env, clientId: string, redirectURI: string): boolean {
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
    storage: CloudflareStorage({ namespace: env.OPENAUTH_STORAGE as any }),
    ttl: {
      access: 60 * 60 * 24 * 365,
      refresh: 60 * 60 * 24 * 365,
      reuse: 60 * 60 * 24,
      retention: 60 * 60 * 24 * 7,
    },
    success: async (ctx, value) => {
      if (value.provider !== "google") return new Response("Invalid provider", { status: 400 });
      const claims = value.id as GoogleOidcClaims;
      if (!claims.email || claims.email_verified === false) {
        return new Response("No verified email from Google", { status: 400 });
      }
      if (normalizeEmail(claims.email) !== normalizeEmail(env.OWNER_EMAIL)) {
        return Response.redirect(`${env.APP_PUBLIC_URL}/forbidden`, 302);
      }
      return ctx.subject("user", { email: claims.email });
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

type SigningKey = {
  id: string;
  privateKey: string;
  alg: string;
  created?: number | string;
};

let cachedSigningKey: SigningKey | null = null;

function isSigningKey(value: unknown): value is SigningKey {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.privateKey === "string" &&
    typeof record.alg === "string"
  );
}

function createdMs(key: SigningKey) {
  if (typeof key.created === "number") return key.created;
  if (typeof key.created === "string") {
    const parsed = Date.parse(key.created);
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
  ).filter(isSigningKey);
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

    const codeEntry = await env.OPENAUTH_STORAGE.get(`oauth:code\x1f${code}`, "json");
    if (
      !codeEntry ||
      typeof codeEntry !== "object" ||
      !("source" in codeEntry) ||
      codeEntry.source !== "shedflare:silent-auth" ||
      !("subject" in codeEntry) ||
      !("properties" in codeEntry)
    ) {
      return null;
    }

    const entry = codeEntry as {
      subject: string;
      properties: { email: string };
      redirectURI?: string;
      clientID?: string;
      pkce?: { challenge: string; method: string };
      ttl?: { access: number; refresh: number };
    };

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
      const data = await env.OPENAUTH_STORAGE.get(key.name, "json");
      if (!data || typeof data !== "object") continue;
      if (!("source" in data) || data.source !== "shedflare:silent-auth") continue;
      const entry = data as {
        source: "shedflare:silent-auth";
        subject: string;
        properties: { email: string };
        ttl?: { access: number; refresh: number };
      };
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
  const url = new URL(request.url);
  const auto = url.searchParams.get("auto") === "1";
  const redirectURI = url.searchParams.get("redirect_uri");

  if (!auto) return null;

  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id");
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");

  if (!redirectURI || responseType !== "code" || !clientId) return null;

  if (
    !validateClientAndRedirectURI(env, clientId, redirectURI) ||
    !isValidRedirectPath(redirectURI)
  ) {
    if (redirectURI) {
      const location = new URL(redirectURI);
      location.searchParams.set("error", "invalid_client");
      return Response.redirect(location.toString(), 302);
    }
    return null;
  }

  const sessionId = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!sessionId) {
    if (redirectURI) {
      const location = new URL(redirectURI);
      location.searchParams.set("error", "no_session");
      return Response.redirect(location.toString(), 302);
    }
    return null;
  }

  const session = await env.OPENAUTH_STORAGE.get(`session:${sessionId}`, "json");
  if (!session || typeof session !== "object" || !("email" in session)) {
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
  const email = (session as { email: string }).email;
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
  const codeEntry = await env.OPENAUTH_STORAGE.get(`oauth:code\x1f${codeMatch}`, "json");
  if (
    !codeEntry ||
    typeof codeEntry !== "object" ||
    !("properties" in codeEntry) ||
    typeof codeEntry.properties !== "object" ||
    codeEntry.properties === null ||
    !("email" in codeEntry.properties)
  ) {
    return response;
  }

  const email = (codeEntry.properties as { email: string }).email;
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
      return new Response("Shedflare Auth", { headers: { "content-type": "text/plain" } });
    }
    if (url.pathname === "/forbidden") {
      return new Response("This Google account is not allowed for this Shedflare install.", {
        status: 403,
      });
    }

    if (url.pathname === "/logout" && request.method === "POST") {
      const returnTo = validateReturnTo(url.searchParams.get("returnTo")) ?? "/";
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
