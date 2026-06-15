import { createClient } from "@openauthjs/openauth/client";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import { AUTH_HINT_COOKIE } from "./client";

export type AuthEnv = {
  AUTH_ISSUER_URL: string;
  AUTH_CLIENT_ID: string;
  APP_PUBLIC_URL: string;
  OWNER_EMAIL: string;
  DEV_AUTH_EMAIL?: string;
  E2E_AUTH_EMAIL?: string;
  E2E_AUTH_TOKEN?: string;
};

export type Session = {
  email: string;
  tokens?: {
    access: string;
    refresh: string;
    expiresIn: number;
  };
};

type AccessVerifyResult = { kind: "ok"; email: string } | { kind: "expired" } | { kind: "invalid" };

const REFRESH_TIMEOUT_MS = 10_000;
const AUTH_STATE_COOKIE = "auth_state";
const STATE_TTL_SECONDS = 600;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

export function serializeCookie(
  name: string,
  value: string,
  opts: {
    maxAge?: number;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
  } = {},
) {
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  if (opts.maxAge !== undefined) cookie += `; Max-Age=${opts.maxAge}`;
  cookie += `; Path=${opts.path ?? "/"}`;
  if (opts.secure !== false) cookie += `; Secure`;
  if (opts.httpOnly !== false) cookie += `; HttpOnly`;
  cookie += `; SameSite=${opts.sameSite ?? "Lax"}`;
  return cookie;
}

export function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function authenticateE2eRequest(request: Request, env: AuthEnv): Session | null {
  if (!env.E2E_AUTH_EMAIL || !env.E2E_AUTH_TOKEN) return null;
  const token = request.headers.get("x-shedflare-e2e-token");
  if (token !== env.E2E_AUTH_TOKEN) return null;
  return { email: normalizeEmail(env.E2E_AUTH_EMAIL) };
}

function envAccessCookie(value: string, maxAge: number) {
  return serializeCookie("auth_access_token", value, { maxAge });
}

function envRefreshCookie(value: string) {
  return serializeCookie("auth_refresh_token", value, { maxAge: 60 * 60 * 24 * 365 });
}

function clearCookie(name: string, opts?: { httpOnly?: boolean }) {
  return serializeCookie(name, "", { maxAge: 0, httpOnly: opts?.httpOnly });
}

function hintCookie(value: string, maxAge?: number) {
  return serializeCookie(AUTH_HINT_COOKIE, value, { maxAge, httpOnly: false });
}

function stateCookie(value: string) {
  return serializeCookie(AUTH_STATE_COOKIE, value, { maxAge: STATE_TTL_SECONDS });
}

export function isDocumentRequest(request: Request): boolean {
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") return false;
  const dest = request.headers.get("sec-fetch-dest");
  if (dest === "document") return true;
  if (dest) return false;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html");
}

export function validateReturnTo(input: unknown): string | null {
  if (typeof input !== "string") return null;
  // Decode first, then validate the result: validating the still-encoded form
  // lets `/%2Fevil` slip through (it isn't "//…" until decoded), turning into a
  // protocol-relative open redirect once used as a Location.
  let decoded: string;
  try {
    decoded = decodeURIComponent(input.trim());
  } catch {
    return null;
  }
  if (!decoded.startsWith("/")) return null;
  if (decoded.startsWith("//")) return null;
  if (decoded.startsWith("/api/")) return null;
  return decoded;
}

function base64urlEncode(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(input: string): string | null {
  try {
    const padded =
      input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

function generateNonce(): string {
  return crypto.randomUUID();
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

type StatePayload = { nonce: string; returnTo: string | null };

function encodeState(returnTo: string | null, nonce: string): string {
  return base64urlEncode(JSON.stringify({ nonce, returnTo }));
}

function decodeState(state: string): StatePayload | null {
  const decoded = base64urlDecode(state);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const nonce = typeof record.nonce === "string" ? record.nonce : "";
    const returnTo = validateReturnTo(record.returnTo);
    return { nonce, returnTo };
  } catch {
    return null;
  }
}

export type HtmlGateResult =
  | { kind: "proceed"; session: Session | null; setCookies: string[] }
  | { kind: "redirect"; response: Response };

export function createAuthHandlers(env: AuthEnv) {
  let jwksUrl: string | null = null;
  let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  function getJwks() {
    const url = `${env.AUTH_ISSUER_URL}/.well-known/jwks.json`;
    if (!jwks || jwksUrl !== url) {
      jwksUrl = url;
      jwks = createRemoteJWKSet(new URL(url));
    }
    return jwks;
  }

  async function verifyAccessToken(
    token: string,
    retryOnFailure: boolean,
  ): Promise<AccessVerifyResult> {
    for (let attempt = 0; attempt < (retryOnFailure ? 2 : 1); attempt++) {
      try {
        const { payload } = await jwtVerify(token, getJwks(), { issuer: env.AUTH_ISSUER_URL });
        if (payload.mode !== "access") return { kind: "invalid" };
        const properties = payload.properties as { email?: unknown } | undefined;
        return typeof properties?.email === "string"
          ? { kind: "ok", email: normalizeEmail(properties.email) }
          : { kind: "invalid" };
      } catch (error) {
        if (error instanceof joseErrors.JWTExpired) return { kind: "expired" };
        if (error instanceof joseErrors.JWSSignatureVerificationFailed && attempt === 0) {
          jwksUrl = null;
          jwks = null;
          continue;
        }
        return { kind: "invalid" };
      }
    }
    return { kind: "invalid" };
  }

  async function parseTokenResponse(response: Response) {
    const jsonBody = await response.json().catch(() => null);
    if (!jsonBody || typeof jsonBody !== "object" || Array.isArray(jsonBody)) return null;
    const tokens = jsonBody as Record<string, unknown>;
    if (
      typeof tokens.access_token !== "string" ||
      typeof tokens.refresh_token !== "string" ||
      typeof tokens.expires_in !== "number"
    ) {
      return null;
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    };
  }

  async function rotateRefreshToken(refreshToken: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      const response = await fetch(`${env.AUTH_ISSUER_URL}/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const parsed = await parseTokenResponse(response);
      if (!parsed) return null;
      return {
        access: parsed.accessToken,
        refresh: parsed.refreshToken,
        expiresIn: parsed.expiresIn,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function authenticate(
    request: Request,
    options?: { refresh?: boolean },
  ): Promise<Session | null> {
    const e2eSession = authenticateE2eRequest(request, env);
    if (e2eSession) return e2eSession;

    if (env.DEV_AUTH_EMAIL && isLocalRequest(request)) {
      return { email: normalizeEmail(env.DEV_AUTH_EMAIL) };
    }

    const accessToken = getCookie(request, "auth_access_token");
    const refreshToken = getCookie(request, "auth_refresh_token");
    if (!accessToken && !refreshToken) return null;

    const verified = accessToken
      ? await verifyAccessToken(accessToken, true)
      : { kind: "invalid" as const };
    if (verified.kind === "ok") return { email: verified.email };

    const shouldRefresh = options?.refresh ?? true;
    if (shouldRefresh && refreshToken) {
      const rotated = await rotateRefreshToken(refreshToken);
      if (!rotated) return null;
      const reverified = await verifyAccessToken(rotated.access, false);
      if (reverified.kind !== "ok") return null;
      return { email: reverified.email, tokens: rotated };
    }

    return null;
  }

  async function requireSession(
    request: Request,
    options?: { refresh?: boolean },
  ): Promise<Session> {
    const session = await authenticate(request, options);
    if (!session) throw new Response("Unauthorized", { status: 401 });
    if (session.email !== normalizeEmail(env.OWNER_EMAIL)) {
      throw new Response("Forbidden", { status: 403 });
    }
    return session;
  }

  function withSessionCookies(response: Response, session: Session) {
    if (!session.tokens) return response;
    const headers = new Headers(response.headers);
    headers.append("Set-Cookie", envAccessCookie(session.tokens.access, session.tokens.expiresIn));
    headers.append("Set-Cookie", envRefreshCookie(session.tokens.refresh));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  function withCookies(response: Response, cookies: string[]) {
    if (cookies.length === 0) return response;
    const headers = new Headers(response.headers);
    for (const cookie of cookies) headers.append("Set-Cookie", cookie);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  async function loginRedirect(returnTo?: string | null): Promise<Response> {
    const validReturnTo = validateReturnTo(returnTo);
    const nonce = generateNonce();
    const client = createClient({ clientID: env.AUTH_CLIENT_ID, issuer: env.AUTH_ISSUER_URL });
    const { url: authUrl } = await client.authorize(
      `${env.APP_PUBLIC_URL}/api/auth/callback`,
      "code",
      { provider: "google" },
    );
    const redirectUrl = new URL(authUrl);
    redirectUrl.searchParams.set("state", encodeState(validReturnTo, nonce));
    const headers = new Headers({ Location: redirectUrl.toString() });
    headers.append("Set-Cookie", stateCookie(nonce));
    return new Response(null, { status: 302, headers });
  }

  async function autoLoginRedirect(returnTo?: string | null): Promise<Response> {
    const response = await loginRedirect(returnTo);
    const location = response.headers.get("Location");
    if (!location) return response;
    const redirectUrl = new URL(location);
    redirectUrl.searchParams.set("auto", "1");
    const headers = new Headers(response.headers);
    headers.set("Location", redirectUrl.toString());
    return new Response(null, { status: response.status, headers });
  }

  async function handleCallback(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!code) return new Response("Missing code", { status: 400 });

    const stateParam = url.searchParams.get("state") ?? "";
    const stateCookieValue = getCookie(request, AUTH_STATE_COOKIE) ?? "";
    const decoded = decodeState(stateParam);
    const returnTo =
      decoded && stateCookieValue && constantTimeEqual(decoded.nonce, stateCookieValue)
        ? decoded.returnTo
        : null;

    const response = await fetch(`${env.AUTH_ISSUER_URL}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        redirect_uri: `${env.APP_PUBLIC_URL}/api/auth/callback`,
        grant_type: "authorization_code",
        client_id: env.AUTH_CLIENT_ID,
        code_verifier: "",
      }),
    });

    const headers = new Headers();
    headers.append("Set-Cookie", clearCookie(AUTH_STATE_COOKIE));

    if (!response.ok) {
      headers.append("Set-Cookie", clearCookie(AUTH_HINT_COOKIE, { httpOnly: false }));
      return new Response(`Authentication failed: ${await response.text()}`, {
        status: response.status,
        headers,
      });
    }

    const tokens = await parseTokenResponse(response);
    if (!tokens) {
      headers.append("Set-Cookie", clearCookie(AUTH_HINT_COOKIE, { httpOnly: false }));
      return new Response("Invalid token response", { status: 502, headers });
    }

    const verified = await verifyAccessToken(tokens.accessToken, false);
    const hintValue = verified.kind === "ok" ? verified.email : "";

    headers.append("Set-Cookie", envAccessCookie(tokens.accessToken, tokens.expiresIn));
    headers.append("Set-Cookie", envRefreshCookie(tokens.refreshToken));
    if (hintValue) headers.append("Set-Cookie", hintCookie(hintValue));
    headers.set("Location", returnTo ?? "/");
    return new Response(null, { status: 302, headers });
  }

  function logout(): Response {
    const headers = new Headers({ Location: "/" });
    headers.append("Set-Cookie", clearCookie("auth_access_token"));
    headers.append("Set-Cookie", clearCookie("auth_refresh_token"));
    headers.append("Set-Cookie", clearCookie(AUTH_HINT_COOKIE, { httpOnly: false }));
    headers.append("Set-Cookie", clearCookie(AUTH_STATE_COOKIE));
    return new Response(null, { status: 302, headers });
  }

  async function sessionEndpoint(request: Request): Promise<Response> {
    const session = await requireSession(request);
    const headers = new Headers({ "content-type": "application/json" });
    if (session.tokens) {
      headers.append(
        "Set-Cookie",
        envAccessCookie(session.tokens.access, session.tokens.expiresIn),
      );
      headers.append("Set-Cookie", envRefreshCookie(session.tokens.refresh));
    }
    headers.append("Set-Cookie", hintCookie(session.email));
    return new Response(JSON.stringify({ user: { email: session.email } }), { headers });
  }

  async function gateHtml(
    request: Request,
    options?: { publicPaths?: string[] },
  ): Promise<HtmlGateResult> {
    const url = new URL(request.url);

    if (!isDocumentRequest(request)) {
      return { kind: "proceed", session: null, setCookies: [] };
    }

    const publicPaths = options?.publicPaths ?? [];
    if (
      publicPaths.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
    ) {
      return { kind: "proceed", session: null, setCookies: [] };
    }

    try {
      const session = await authenticate(request, { refresh: true });
      if (session) {
        const setCookies: string[] = [];
        if (session.tokens) {
          setCookies.push(envAccessCookie(session.tokens.access, session.tokens.expiresIn));
          setCookies.push(envRefreshCookie(session.tokens.refresh));
        }
        setCookies.push(hintCookie(session.email));
        return { kind: "proceed", session, setCookies };
      }
    } catch {
      // Verification failures collapse to the safe state: treat as unauthenticated.
    }

    const setCookies = [
      clearCookie("auth_access_token"),
      clearCookie("auth_refresh_token"),
      clearCookie(AUTH_HINT_COOKIE, { httpOnly: false }),
    ];

    // Silent auth is one-shot. If the issuer already bounced us back with
    // `no_session`, redirecting into another silent attempt would loop forever
    // (gate → issuer → no_session → gate). Serve the SPA so the client can
    // render its manual sign-in overlay instead.
    if (url.searchParams.get("error") === "no_session") {
      return { kind: "proceed", session: null, setCookies };
    }

    const returnTo = validateReturnTo(`${url.pathname}${url.search}`);
    const redirectResponse = await autoLoginRedirect(returnTo);
    const headers = new Headers(redirectResponse.headers);
    for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
    return {
      kind: "redirect",
      response: new Response(null, { status: redirectResponse.status, headers }),
    };
  }

  return {
    authenticate,
    requireSession,
    withSessionCookies,
    withCookies,
    loginRedirect,
    autoLoginRedirect,
    handleCallback,
    logout,
    sessionEndpoint,
    gateHtml,
    serializeCookie,
    normalizeEmail,
    getCookie,
    isDocumentRequest,
    validateReturnTo,
  };
}
