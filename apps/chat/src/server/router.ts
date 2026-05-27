import { createHttpApiWebHandler } from "@shedflare/alchemy";
import { createClient } from "@openauthjs/openauth/client";
import { decodeTokenResponse, setRuntimeEnv } from "#/runtime";
import { chatApi } from "./definitions";
import { createBootstrapGroup, createModelsGroup, createUploadsGroup } from "./impl/all";
import { handleSync } from "../api/sync";
import { handleUploadBlobPut, handleUploadBlobGet } from "../api/uploads-blob";
import { BUILD_INFO } from "../lib/build-info";
import { createStructuredLogger } from "#/effect";

const logger = createStructuredLogger("chat-worker");

const withVersionHeader = (response: Response) => {
  const wrapped = new Response(response.body, response);
  wrapped.headers.set("x-shedflare-version", BUILD_INFO.version);
  return wrapped;
};

function serializeCookie(
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

type RawEnv = {
  APP_PUBLIC_URL: string;
  AUTH_ISSUER_URL?: string;
  AUTH_CLIENT_ID?: string;
  OPENCODE_GO_API_KEY: string;
  UPLOAD_TOKEN_SECRET: string;
  EXA_API_KEY?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
  UPLOADS: R2Bucket;
  SYNC_ENGINE: DurableObjectNamespace;
  [key: string]: unknown;
};

export function createRouter(env: RawEnv) {
  const wh = createHttpApiWebHandler(chatApi, [
    createBootstrapGroup(),
    createModelsGroup(),
    createUploadsGroup(),
  ]);

  return {
    async fetch(request: Request): Promise<Response> {
      try {
        const resolved: Record<string, unknown> = { ...env };
        setRuntimeEnv(resolved);

        const url = new URL(request.url);
        const { pathname } = url;
        const method = request.method;
        const appHost = new URL(env.APP_PUBLIC_URL).hostname;
        const localHost =
          url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          url.hostname === "0.0.0.0";

        if (!localHost && url.hostname !== appHost) {
          return withVersionHeader(new Response("Not found", { status: 404 }));
        }

        if (pathname.startsWith("/api/")) {
          if (pathname === "/api/auth/login" && method === "GET") {
            const startedAt = Date.now();
            const client = createClient({
              clientID: env.AUTH_CLIENT_ID ?? "shedflare-chat",
              issuer: env.AUTH_ISSUER_URL ?? env.APP_PUBLIC_URL,
            });
            const { url: authUrl } = await client.authorize(
              `${env.APP_PUBLIC_URL}/api/auth/callback`,
              "code",
              { provider: "google" },
            );
            logger.log("auth_login_redirect_created", { durationMs: Date.now() - startedAt });
            return withVersionHeader(Response.redirect(authUrl, 302));
          }

          if (pathname === "/api/auth/callback" && method === "GET") {
            const startedAt = Date.now();
            const code = url.searchParams.get("code");
            if (!code) {
              return withVersionHeader(new Response("Missing code", { status: 400 }));
            }
            const tokenResponse = await fetch(
              new Request(`${env.AUTH_ISSUER_URL ?? env.APP_PUBLIC_URL}/token`, {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  code,
                  redirect_uri: `${env.APP_PUBLIC_URL}/api/auth/callback`,
                  grant_type: "authorization_code",
                  client_id: env.AUTH_CLIENT_ID ?? "shedflare-chat",
                  code_verifier: "",
                }),
              }),
            );
            if (!tokenResponse.ok) {
              const errorText = await tokenResponse.text();
              logger.log(
                "auth_callback_token_exchange_failed",
                { status: tokenResponse.status, durationMs: Date.now() - startedAt },
                "warn",
              );
              return withVersionHeader(
                new Response(`Authentication failed: ${errorText}`, {
                  status: tokenResponse.status,
                }),
              );
            }
            const tokens = decodeTokenResponse(await tokenResponse.json());
            if (!tokens) {
              logger.log(
                "auth_callback_token_response_invalid",
                { durationMs: Date.now() - startedAt },
                "warn",
              );
              return withVersionHeader(new Response("Authentication failed", { status: 502 }));
            }
            const headers = new Headers();
            headers.append(
              "Set-Cookie",
              serializeCookie("auth_access_token", tokens.access_token, {
                maxAge: tokens.expires_in,
              }),
            );
            headers.append(
              "Set-Cookie",
              serializeCookie("auth_refresh_token", tokens.refresh_token, {
                maxAge: 60 * 60 * 24 * 365,
              }),
            );
            headers.set("Location", "/");
            logger.log("auth_callback_completed", { durationMs: Date.now() - startedAt });
            return withVersionHeader(new Response(null, { status: 302, headers }));
          }

          if (pathname === "/api/auth/logout" && method === "POST") {
            const headers = new Headers();
            headers.append("Set-Cookie", serializeCookie("auth_access_token", "", { maxAge: 0 }));
            headers.append("Set-Cookie", serializeCookie("auth_refresh_token", "", { maxAge: 0 }));
            headers.set("Location", "/");
            return withVersionHeader(new Response(null, { status: 302, headers }));
          }

          if (pathname.startsWith("/api/sync/")) {
            return withVersionHeader(await handleSync(request));
          }

          if (pathname.startsWith("/api/uploads/blob/")) {
            if (method === "PUT") return withVersionHeader(await handleUploadBlobPut(request));
            if (method === "GET") return withVersionHeader(await handleUploadBlobGet(request));
            return wh.handler(request);
          }

          return wh.handler(request);
        }

        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status === 404) {
          return withVersionHeader(
            await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin))),
          );
        }

        const headers = new Headers(assetResponse.headers);
        headers.set("cache-control", "public, max-age=31536000, immutable");
        headers.set("x-shedflare-version", BUILD_INFO.version);
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers,
          webSocket: (assetResponse as any).webSocket,
        });
      } catch (error) {
        if (error instanceof Response) return withVersionHeader(error);
        logger.log(
          "unhandled_error",
          { error: error instanceof Error ? error.message : String(error) },
          "error",
        );
        return withVersionHeader(new Response("Internal Server Error", { status: 500 }));
      }
    },
  };
}
