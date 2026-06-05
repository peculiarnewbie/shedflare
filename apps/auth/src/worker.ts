import { issuer } from "@openauthjs/openauth";
import { GoogleOidcProvider } from "@openauthjs/openauth/provider/google";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

type Env = {
  APP_PUBLIC_URL: string;
  GOOGLE_CLIENT_ID: string;
  OWNER_EMAIL: string;
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
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

async function handleSilentAuth(request: Request, env: Env): Promise<Response | null> {
  const sessionId = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!sessionId) return null;

  const session = await env.OPENAUTH_STORAGE.get(`session:${sessionId}`, "json");
  if (!session || typeof session !== "object" || !("email" in session)) return null;

  const url = new URL(request.url);
  const redirectURI = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id");
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");

  if (!redirectURI || responseType !== "code" || !clientId) return null;

  const code = crypto.randomUUID();
  const email = (session as { email: string }).email;
  const subject = `user:${email}`;

  await env.OPENAUTH_STORAGE.put(
    `oauth:code\x1f${code}`,
    JSON.stringify({
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

    if (url.pathname === "/authorize") {
      const silent = await handleSilentAuth(request, env);
      if (silent) return silent;
    }

    const response = await getIssuer(env).fetch(request, env, ctx);

    if (url.pathname.match(/^\/[^/]+\/callback$/)) {
      return handleCallbackSession(response, env);
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
