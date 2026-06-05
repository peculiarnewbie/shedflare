import { and, desc, eq, like as likeOp, or, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerResponse } from "effect/unstable/http";
import { fileTags, files, tags } from "../../db/schema";
import { driveApi } from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

type Db = DrizzleD1Database;

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

function publicFile(row: any) {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    description: row.description ?? "",
    isPublic: Boolean(row.isPublic),
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
      .onConflictDoNothing({ target: tags.normalizedName });
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
      isPublic: files.isPublic,
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

type UpdateFileBody = {
  name?: string;
  description?: string;
  isPublic?: boolean;
  tags?: string[];
};

function parseUpdateBody(value: unknown): UpdateFileBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const body: UpdateFileBody = {};
  if (input.name !== undefined) {
    if (typeof input.name !== "string") return null;
    body.name = input.name;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") return null;
    body.description = input.description;
  }
  if (input.isPublic !== undefined) {
    if (typeof input.isPublic !== "boolean") return null;
    body.isPublic = input.isPublic;
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((t: unknown) => typeof t !== "string"))
      return null;
    body.tags = input.tags;
  }
  return body;
}

type FileEnv = { DB: D1Database; FILES: R2Bucket };

let publicSharingSchemaReady: Promise<void> | null = null;

async function ensurePublicSharingSchema(env: FileEnv) {
  publicSharingSchemaReady ??= (async () => {
    try {
      await env.DB.prepare(
        "ALTER TABLE files ADD COLUMN is_public integer NOT NULL DEFAULT 0",
      ).run();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.toLowerCase().includes("duplicate column")) {
        throw error;
      }
    }

    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_files_is_public_created_at ON files (is_public, created_at)",
    ).run();
  })();

  return publicSharingSchemaReady;
}

export async function listPublicFiles(env: FileEnv, _request: Request) {
  await ensurePublicSharingSchema(env);
  const db = drizzle(env.DB);
  const rows = await db
    .select({
      id: files.id,
      name: files.name,
      mimeType: files.mimeType,
      size: files.size,
      description: files.description,
      isPublic: files.isPublic,
      createdAt: files.createdAt,
      updatedAt: files.updatedAt,
      tags: sql<string | null>`group_concat(${tags.name})`,
    })
    .from(files)
    .leftJoin(fileTags, eq(fileTags.fileId, files.id))
    .leftJoin(tags, eq(tags.id, fileTags.tagId))
    .where(eq(files.isPublic, true))
    .groupBy(files.id)
    .orderBy(desc(files.createdAt))
    .all();

  return new Response(JSON.stringify({ files: rows.map(publicFile) }), {
    headers: { "content-type": "application/json" },
  });
}

export async function servePublicFile(
  env: FileEnv,
  id: string,
  disposition: "inline" | "download",
) {
  await ensurePublicSharingSchema(env);
  const db = drizzle(env.DB);
  const row = await getFile(db, id);
  if (!row || !row.isPublic) return new Response("Not found", { status: 404 });

  const object = await env.FILES.get(row.objectKey);
  if (!object) return new Response("File object missing", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-length", String(object.size));
  headers.set(
    "content-disposition",
    disposition === "download"
      ? `attachment; filename="${row.name.replaceAll('"', "'")}"`
      : "inline",
  );
  return new Response(object.body, { headers });
}

export function createFileHandlersGroup(env: FileEnv, auth: HttpApiAuth) {
  const endpoints = (driveApi as any).groups["files"].endpoints;
  return (HttpApiBuilder.group as any)(driveApi, "files", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: auth.createProtectedHandler(async (webReq) => {
        await ensurePublicSharingSchema(env);
        const db = drizzle(env.DB);
        const url = new URL(webReq.url);
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
            isPublic: files.isPublic,
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
        return { files: pageRows.map(publicFile), nextOffset: hasMore ? offset + limit : null };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("create", {
      endpoint: endpoints["create"],
      handler: auth.createProtectedHandler(async (webReq) => {
        await ensurePublicSharingSchema(env);
        const db = drizzle(env.DB);
        const form = await webReq.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return HttpServerResponse.fromWeb(
            new Response(JSON.stringify({ error: "Missing file" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            }),
          );
        }

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const formName = form.get("name");
        const formDescription = form.get("description");
        const name = typeof formName === "string" ? formName.trim() : file.name;
        const description = typeof formDescription === "string" ? formDescription.trim() : "";
        const rawTags = form.get("tags");
        const tagNames: string[] =
          typeof rawTags === "string"
            ? Array.from(
                new Set(rawTags.split(",").map(normalizeTag).filter(Boolean) as string[]),
              ).slice(0, 20)
            : [];
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
          isPublic: false,
          createdAt: now,
          updatedAt: now,
        });
        await setFileTags(db, id, tagNames);

        const row = await getFile(db, id);
        if (row) {
          return HttpServerResponse.fromWeb(
            new Response(JSON.stringify({ file: publicFile(row) }), {
              status: 201,
              headers: { "content-type": "application/json" },
            }),
          );
        }
        return HttpServerResponse.fromWeb(
          new Response(JSON.stringify({ file: null }), {
            status: 201,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("update", {
      endpoint: endpoints["update"],
      handler: auth.createProtectedHandler(async (webReq, _session, ctx) => {
        await ensurePublicSharingSchema(env);
        const db = drizzle(env.DB);
        const id = ctx.params?.id as string;
        const current = await getFile(db, id);
        if (!current) return HttpServerResponse.fromWeb(new Response("Not found", { status: 404 }));

        const rawBody = await webReq.json().catch(() => null);
        const body = parseUpdateBody(rawBody);
        if (!body) {
          return HttpServerResponse.fromWeb(
            new Response(JSON.stringify({ error: "Invalid request body" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            }),
          );
        }

        const name = body.name?.trim() || current.name;
        const description = body.description?.trim() ?? current.description ?? "";
        const isPublic = body.isPublic ?? Boolean(current.isPublic);
        const tagNames: string[] = Array.isArray(body.tags)
          ? Array.from(new Set(body.tags.map(normalizeTag).filter(Boolean) as string[])).slice(
              0,
              20,
            )
          : (current.tags?.split(",") ?? []);
        const now = new Date().toISOString();

        await db
          .update(files)
          .set({ name, description, isPublic, updatedAt: now })
          .where(eq(files.id, id));
        await setFileTags(db, id, tagNames);

        const row = await getFile(db, id);
        return { file: row ? publicFile(row) : null };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("delete", {
      endpoint: endpoints["delete"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        await ensurePublicSharingSchema(env);
        const db = drizzle(env.DB);
        const id = ctx.params?.id as string;
        const row = await getFile(db, id);
        if (!row) return HttpServerResponse.fromWeb(new Response("Not found", { status: 404 }));
        await env.FILES.delete(row.objectKey);
        await db.delete(files).where(eq(files.id, id));
        return { ok: true };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("download", {
      endpoint: endpoints["download"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        await ensurePublicSharingSchema(env);
        const db = drizzle(env.DB);
        const id = ctx.params?.id as string;
        const row = await getFile(db, id);
        if (!row) return HttpServerResponse.fromWeb(new Response("Not found", { status: 404 }));

        const object = await env.FILES.get(row.objectKey);
        if (!object)
          return HttpServerResponse.fromWeb(new Response("File object missing", { status: 404 }));

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("content-length", String(object.size));
        headers.set(
          "content-disposition",
          `attachment; filename="${row.name.replaceAll('"', "'")}"`,
        );
        return HttpServerResponse.fromWeb(new Response(object.body, { headers }));
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("preview", {
      endpoint: endpoints["preview"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        await ensurePublicSharingSchema(env);
        const db = drizzle(env.DB);
        const id = ctx.params?.id as string;
        const row = await getFile(db, id);
        if (!row) return HttpServerResponse.fromWeb(new Response("Not found", { status: 404 }));

        const object = await env.FILES.get(row.objectKey);
        if (!object)
          return HttpServerResponse.fromWeb(new Response("File object missing", { status: 404 }));

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("content-length", String(object.size));
        headers.set("content-disposition", "inline");
        return HttpServerResponse.fromWeb(new Response(object.body, { headers }));
      }),
      isRaw: false,
      uninterruptible: false,
    });

    return handlers;
  });
}
