import { createClient } from "@openauthjs/openauth/client";
import { and, count, desc, eq, like as likeOp, or, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import { fileTags, files, tags, type FileRow } from "./db/schema";

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  FILES: R2Bucket;
  APP_PUBLIC_URL: string;
  AUTH_ISSUER_URL: string;
  AUTH_CLIENT_ID: string;
  OWNER_EMAIL: string;
  DEV_AUTH_EMAIL?: string;
};

type Db = DrizzleD1Database;

type FileWithTags = FileRow & {
  tags: string | null;
};

type UpdateFileBody = {
  name?: string;
  description?: string;
  tags?: string[];
};

type AccessVerifyResult = { kind: "ok"; email: string } | { kind: "expired" } | { kind: "invalid" };

type Session = {
  email: string;
  tokens?: {
    access: string;
    refresh: string;
    expiresIn: number;
  };
};

const logger = createStructuredLogger("drive-worker");

function createStructuredLogger(scope: string) {
  return {
    log(
      event: string,
      details: Record<string, unknown> = {},
      level: "info" | "warn" | "error" = "info",
    ) {
      const entry = JSON.stringify({ scope, event, level, ...details });
      switch (level) {
        case "warn":
          console.warn(entry);
          break;
        case "error":
          console.error(entry);
          break;
        default:
          console.log(entry);
          break;
      }
    },
  };
}

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

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

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

function parseTags(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  return Array.from(new Set(value.split(",").map(normalizeTag).filter(Boolean))).slice(0, 20);
}

function parseUpdateFileBody(value: unknown): UpdateFileBody | Response {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return json({ error: "Expected JSON object" }, { status: 400 });
  }
  const input = value as Record<string, unknown>;
  const body: UpdateFileBody = {};

  if (input.name !== undefined) {
    if (typeof input.name !== "string") return json({ error: "Invalid name" }, { status: 400 });
    body.name = input.name;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") {
      return json({ error: "Invalid description" }, { status: 400 });
    }
    body.description = input.description;
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string")) {
      return json({ error: "Invalid tags" }, { status: 400 });
    }
    body.tags = input.tags;
  }

  return body;
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }
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

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

let jwksUrl: string | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(env: Env) {
  const url = `${env.AUTH_ISSUER_URL}/.well-known/jwks.json`;
  if (!jwks || jwksUrl !== url) {
    jwksUrl = url;
    jwks = createRemoteJWKSet(new URL(url));
  }
  return jwks;
}

async function verifyAccessToken(token: string, env: Env): Promise<AccessVerifyResult> {
  try {
    const { payload } = await jwtVerify(token, getJwks(env), { issuer: env.AUTH_ISSUER_URL });
    if (payload.mode !== "access") return { kind: "invalid" };
    const properties = payload.properties as { email?: unknown } | undefined;
    return typeof properties?.email === "string"
      ? { kind: "ok", email: normalizeEmail(properties.email) }
      : { kind: "invalid" };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) return { kind: "expired" };
    return { kind: "invalid" };
  }
}

async function rotateRefreshToken(refreshToken: string, env: Env) {
  const response = await fetch(`${env.AUTH_ISSUER_URL}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) return null;
  const tokens = await parseTokenResponse(response);
  if (!tokens) return null;
  return {
    access: tokens.accessToken,
    refresh: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
  };
}

async function getSession(request: Request, env: Env): Promise<Session | null> {
  if (env.DEV_AUTH_EMAIL && isLocalRequest(request))
    return { email: normalizeEmail(env.DEV_AUTH_EMAIL) };
  const accessToken = getCookie(request, "auth_access_token");
  const refreshToken = getCookie(request, "auth_refresh_token");
  if (!accessToken && !refreshToken) return null;
  const verified: AccessVerifyResult = accessToken
    ? await verifyAccessToken(accessToken, env)
    : { kind: "invalid" };
  if (verified.kind === "ok") return { email: verified.email };
  if (refreshToken) {
    const rotated = await rotateRefreshToken(refreshToken, env);
    if (!rotated) return null;
    const reverified = await verifyAccessToken(rotated.access, env);
    if (reverified.kind !== "ok") return null;
    return { email: reverified.email, tokens: rotated };
  }
  return null;
}

function withSessionCookies(response: Response, session: Session) {
  if (!session.tokens) return response;
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    serializeCookie("auth_access_token", session.tokens.access, {
      maxAge: session.tokens.expiresIn,
    }),
  );
  headers.append(
    "Set-Cookie",
    serializeCookie("auth_refresh_token", session.tokens.refresh, { maxAge: 60 * 60 * 24 * 365 }),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function requireOwner(request: Request, env: Env) {
  const session = await getSession(request, env);
  const email = session?.email;
  if (!email) throw new Response("Unauthorized", { status: 401 });
  if (email !== normalizeEmail(env.OWNER_EMAIL)) throw new Response("Forbidden", { status: 403 });
  return session;
}

function getDb(env: Env) {
  return drizzle(env.DB);
}

function publicFile(row: FileWithTags) {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    description: row.description ?? "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: row.tags ? row.tags.split(",").filter(Boolean) : [],
  };
}

async function setFileTags(db: Db, fileId: string, tagNames: string[]) {
  await db.delete(fileTags).where(eq(fileTags.fileId, fileId));
  for (const tag of tagNames) {
    const tagId = crypto.randomUUID();
    await db
      .insert(tags)
      .values({ id: tagId, name: tag, normalizedName: tag })
      .onConflictDoNothing({
        target: tags.normalizedName,
      });
    const existing = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.normalizedName, tag))
      .get();
    if (existing) {
      await db.insert(fileTags).values({ fileId, tagId: existing.id }).onConflictDoNothing();
    }
  }
}

async function getFile(db: Db, id: string) {
  return await db
    .select({
      id: files.id,
      objectKey: files.objectKey,
      name: files.name,
      mimeType: files.mimeType,
      size: files.size,
      description: files.description,
      createdAt: files.createdAt,
      updatedAt: files.updatedAt,
      tags: sql<string | null>`group_concat(${tags.name})`,
    })
    .from(files)
    .leftJoin(fileTags, eq(fileTags.fileId, files.id))
    .leftJoin(tags, eq(tags.id, fileTags.tagId))
    .where(eq(files.id, id))
    .groupBy(files.id)
    .get();
}

async function handleList(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const tag = normalizeTag(url.searchParams.get("tag") ?? "");
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "30", 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 30 : rawLimit, 1), 100);
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

  const searchLike = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const searchWhere = search
    ? or(
        likeOp(files.name, searchLike),
        likeOp(files.description, searchLike),
        likeOp(files.mimeType, searchLike),
        sql`${files.id} IN (SELECT ft.file_id FROM file_tags ft JOIN tags t ON t.id = ft.tag_id WHERE t.name LIKE ${searchLike} ESCAPE '\\')`,
      )
    : undefined;
  const tagWhere = tag
    ? sql`${files.id} IN (SELECT ft.file_id FROM file_tags ft JOIN tags t ON t.id = ft.tag_id WHERE t.normalized_name = ${tag})`
    : undefined;
  const rows = await db
    .select({
      id: files.id,
      objectKey: files.objectKey,
      name: files.name,
      mimeType: files.mimeType,
      size: files.size,
      description: files.description,
      createdAt: files.createdAt,
      updatedAt: files.updatedAt,
      tags: sql<string | null>`group_concat(${tags.name})`,
    })
    .from(files)
    .leftJoin(fileTags, eq(fileTags.fileId, files.id))
    .leftJoin(tags, eq(tags.id, fileTags.tagId))
    .where(and(searchWhere, tagWhere))
    .groupBy(files.id)
    .orderBy(desc(files.createdAt))
    .limit(limit + 1)
    .offset(offset)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return withSessionCookies(
    json({
      files: pageRows.map(publicFile),
      nextOffset: hasMore ? offset + limit : null,
    }),
    session,
  );
}

async function handleUpload(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Missing file" }, { status: 400 });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const formName = form.get("name");
  const formDescription = form.get("description");
  const name = typeof formName === "string" ? formName.trim() : file.name;
  const description = typeof formDescription === "string" ? formDescription.trim() : "";
  const tags = parseTags(form.get("tags"));
  const objectKey = `files/${id}`;

  await env.FILES.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await db.insert(files).values({
    id,
    objectKey,
    name: name || file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    description,
    createdAt: now,
    updatedAt: now,
  });
  await setFileTags(db, id, tags);

  const row = await getFile(db, id);
  return withSessionCookies(json({ file: row ? publicFile(row) : null }, { status: 201 }), session);
}

async function handleUpdate(request: Request, env: Env, id: string) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const current = await getFile(db, id);
  if (!current) return new Response("Not found", { status: 404 });

  const jsonBody = await parseJsonBody(request);
  if (jsonBody instanceof Response) return jsonBody;
  const body = parseUpdateFileBody(jsonBody);
  if (body instanceof Response) return body;
  const name = body.name?.trim() || current.name;
  const description = body.description?.trim() ?? current.description ?? "";
  const tags = Array.isArray(body.tags)
    ? Array.from(new Set(body.tags.map(normalizeTag).filter(Boolean))).slice(0, 20)
    : (current.tags?.split(",") ?? []);
  const now = new Date().toISOString();

  await db.update(files).set({ name, description, updatedAt: now }).where(eq(files.id, id));
  await setFileTags(db, id, tags);

  const row = await getFile(db, id);
  return withSessionCookies(json({ file: row ? publicFile(row) : null }), session);
}

async function handleDownload(request: Request, env: Env, id: string) {
  const session = await requireOwner(request, env);
  const row = await getFile(getDb(env), id);
  if (!row) return new Response("Not found", { status: 404 });

  const object = await env.FILES.get(row.objectKey);
  if (!object) return new Response("File object missing", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-length", String(object.size));
  headers.set("content-disposition", `attachment; filename="${row.name.replaceAll('"', "'")}"`);
  return withSessionCookies(new Response(object.body, { headers }), session);
}

async function handleDelete(request: Request, env: Env, id: string) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const row = await getFile(db, id);
  if (!row) return new Response("Not found", { status: 404 });
  await env.FILES.delete(row.objectKey);
  await db.delete(files).where(eq(files.id, id));
  return withSessionCookies(json({ ok: true }), session);
}

async function handleTags(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const rows = await getDb(env)
    .select({ name: tags.name, count: count(fileTags.fileId) })
    .from(tags)
    .innerJoin(fileTags, eq(fileTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(tags.name)
    .all();
  return withSessionCookies(json({ tags: rows }), session);
}

async function handleSession(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const headers = new Headers({ "content-type": "application/json" });
  if (session.tokens) {
    headers.append(
      "Set-Cookie",
      serializeCookie("auth_access_token", session.tokens.access, {
        maxAge: session.tokens.expiresIn,
      }),
    );
    headers.append(
      "Set-Cookie",
      serializeCookie("auth_refresh_token", session.tokens.refresh, { maxAge: 60 * 60 * 24 * 365 }),
    );
  }
  return new Response(JSON.stringify({ user: { email: session.email } }), { headers });
}

async function handleLogin(env: Env) {
  const client = createClient({ clientID: env.AUTH_CLIENT_ID, issuer: env.AUTH_ISSUER_URL });
  const { url } = await client.authorize(`${env.APP_PUBLIC_URL}/api/auth/callback`, "code", {
    provider: "google",
  });
  return Response.redirect(url, 302);
}

async function handleCallback(request: Request, env: Env) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return new Response("Missing code", { status: 400 });
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
  if (!response.ok)
    return new Response(`Authentication failed: ${await response.text()}`, {
      status: response.status,
    });
  const tokens = await parseTokenResponse(response);
  if (!tokens) return new Response("Invalid token response", { status: 502 });
  const headers = new Headers({ Location: "/" });
  headers.append(
    "Set-Cookie",
    serializeCookie("auth_access_token", tokens.accessToken, { maxAge: tokens.expiresIn }),
  );
  headers.append(
    "Set-Cookie",
    serializeCookie("auth_refresh_token", tokens.refreshToken, { maxAge: 60 * 60 * 24 * 365 }),
  );
  return new Response(null, { status: 302, headers });
}

function handleLogout() {
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", serializeCookie("auth_access_token", "", { maxAge: 0 }));
  headers.append("Set-Cookie", serializeCookie("auth_refresh_token", "", { maxAge: 0 }));
  return new Response(null, { status: 302, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname.startsWith("/api/")) {
        if (pathname === "/api/auth/login" && request.method === "GET")
          return await handleLogin(env);
        if (pathname === "/api/auth/callback" && request.method === "GET")
          return await handleCallback(request, env);
        if (pathname === "/api/auth/logout" && request.method === "POST") return handleLogout();
        if (pathname === "/api/session" && request.method === "GET")
          return await handleSession(request, env);
        if (pathname === "/api/files" && request.method === "GET")
          return await handleList(request, env);
        if (pathname === "/api/files" && request.method === "POST")
          return await handleUpload(request, env);
        if (pathname === "/api/tags" && request.method === "GET")
          return await handleTags(request, env);

        const downloadMatch = pathname.match(/^\/api\/files\/([^/]+)\/download$/);
        if (downloadMatch && request.method === "GET")
          return await handleDownload(request, env, downloadMatch[1]!);

        const fileMatch = pathname.match(/^\/api\/files\/([^/]+)$/);
        if (fileMatch && request.method === "PATCH")
          return await handleUpdate(request, env, fileMatch[1]!);
        if (fileMatch && request.method === "DELETE")
          return await handleDelete(request, env, fileMatch[1]!);

        return new Response("Not found", { status: 404 });
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 404) {
        return await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
      }
      return assetResponse;
    } catch (error) {
      if (error instanceof Response) return error;
      logger.log(
        "unhandled_error",
        { error: error instanceof Error ? error.message : String(error) },
        "error",
      );
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
