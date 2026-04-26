type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  FILES: R2Bucket;
  APP_PUBLIC_URL: string;
  OWNER_EMAIL: string;
  DEV_AUTH_EMAIL?: string;
};

type FileRow = {
  id: string;
  object_key: string;
  name: string;
  mime_type: string;
  size: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  tags: string | null;
};

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

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

function parseTags(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  return Array.from(new Set(value.split(",").map(normalizeTag).filter(Boolean))).slice(0, 20);
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function getAccessEmail(request: Request, env: Env) {
  const accessEmail = request.headers.get("cf-access-authenticated-user-email");
  if (accessEmail) return normalizeEmail(accessEmail);
  if (env.DEV_AUTH_EMAIL && isLocalRequest(request)) return normalizeEmail(env.DEV_AUTH_EMAIL);
  return null;
}

function requireOwner(request: Request, env: Env) {
  const email = getAccessEmail(request, env);
  if (!email) throw new Response("Unauthorized", { status: 401 });
  if (email !== normalizeEmail(env.OWNER_EMAIL)) throw new Response("Forbidden", { status: 403 });
  return { email };
}

function publicFile(row: FileRow) {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    description: row.description ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: row.tags ? row.tags.split(",").filter(Boolean) : [],
  };
}

async function setFileTags(db: D1Database, fileId: string, tags: string[]) {
  await db.prepare("DELETE FROM file_tags WHERE file_id = ?").bind(fileId).run();
  for (const tag of tags) {
    const tagId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO tags (id, name, normalized_name) VALUES (?, ?, ?) ON CONFLICT(normalized_name) DO NOTHING",
      )
      .bind(tagId, tag, tag)
      .run();
    const existing = await db
      .prepare("SELECT id FROM tags WHERE normalized_name = ?")
      .bind(tag)
      .first<{ id: string }>();
    if (existing) {
      await db
        .prepare("INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)")
        .bind(fileId, existing.id)
        .run();
    }
  }
}

async function getFile(db: D1Database, id: string) {
  return await db
    .prepare(
      `SELECT files.*, group_concat(tags.name) AS tags
       FROM files
       LEFT JOIN file_tags ON file_tags.file_id = files.id
       LEFT JOIN tags ON tags.id = file_tags.tag_id
       WHERE files.id = ?
       GROUP BY files.id`,
    )
    .bind(id)
    .first<FileRow>();
}

async function handleList(request: Request, env: Env) {
  requireOwner(request, env);
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const tag = normalizeTag(url.searchParams.get("tag") ?? "");
  const like = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

  const rows = await env.DB.prepare(
    `SELECT files.*, group_concat(tags.name) AS tags
       FROM files
       LEFT JOIN file_tags ON file_tags.file_id = files.id
       LEFT JOIN tags ON tags.id = file_tags.tag_id
       WHERE (? = '' OR files.name LIKE ? ESCAPE '\\' OR files.description LIKE ? ESCAPE '\\' OR files.mime_type LIKE ? ESCAPE '\\' OR files.id IN (
         SELECT ft.file_id FROM file_tags ft JOIN tags t ON t.id = ft.tag_id WHERE t.name LIKE ? ESCAPE '\\'
       ))
       AND (? = '' OR files.id IN (
         SELECT ft.file_id FROM file_tags ft JOIN tags t ON t.id = ft.tag_id WHERE t.normalized_name = ?
       ))
       GROUP BY files.id
       ORDER BY files.created_at DESC
       LIMIT 200`,
  )
    .bind(search, like, like, like, like, tag, tag)
    .all<FileRow>();
  return json({ files: rows.results.map(publicFile) });
}

async function handleUpload(request: Request, env: Env) {
  requireOwner(request, env);
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
  await env.DB.prepare(
    "INSERT INTO files (id, object_key, name, mime_type, size, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      objectKey,
      name || file.name,
      file.type || "application/octet-stream",
      file.size,
      description,
      now,
      now,
    )
    .run();
  await setFileTags(env.DB, id, tags);

  const row = await getFile(env.DB, id);
  return json({ file: row ? publicFile(row) : null }, { status: 201 });
}

async function handleUpdate(request: Request, env: Env, id: string) {
  requireOwner(request, env);
  const current = await getFile(env.DB, id);
  if (!current) return new Response("Not found", { status: 404 });

  const body = (await request.json()) as { name?: string; description?: string; tags?: string[] };
  const name = body.name?.trim() || current.name;
  const description = body.description?.trim() ?? current.description ?? "";
  const tags = Array.isArray(body.tags)
    ? Array.from(new Set(body.tags.map(normalizeTag).filter(Boolean))).slice(0, 20)
    : (current.tags?.split(",") ?? []);
  const now = new Date().toISOString();

  await env.DB.prepare("UPDATE files SET name = ?, description = ?, updated_at = ? WHERE id = ?")
    .bind(name, description, now, id)
    .run();
  await setFileTags(env.DB, id, tags);

  const row = await getFile(env.DB, id);
  return json({ file: row ? publicFile(row) : null });
}

async function handleDownload(request: Request, env: Env, id: string) {
  requireOwner(request, env);
  const row = await getFile(env.DB, id);
  if (!row) return new Response("Not found", { status: 404 });

  const object = await env.FILES.get(row.object_key);
  if (!object) return new Response("File object missing", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-length", String(object.size));
  headers.set("content-disposition", `attachment; filename="${row.name.replaceAll('"', "'")}"`);
  return new Response(object.body, { headers });
}

async function handleDelete(request: Request, env: Env, id: string) {
  requireOwner(request, env);
  const row = await getFile(env.DB, id);
  if (!row) return new Response("Not found", { status: 404 });
  await env.FILES.delete(row.object_key);
  await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function handleTags(request: Request, env: Env) {
  requireOwner(request, env);
  const rows = await env.DB.prepare(
    `SELECT tags.name, count(file_tags.file_id) AS count
       FROM tags
       JOIN file_tags ON file_tags.tag_id = tags.id
       GROUP BY tags.id
       ORDER BY tags.name`,
  ).all<{ name: string; count: number }>();
  return json({ tags: rows.results });
}

async function handleSession(request: Request, env: Env) {
  const session = requireOwner(request, env);
  return json({ user: session });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname.startsWith("/api/")) {
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
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
