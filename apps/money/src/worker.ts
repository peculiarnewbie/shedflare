import { createClient } from "@openauthjs/openauth/client";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import {
  exchangeRates,
  manualItems,
  monthlyItems,
  monthlyToggles,
  type MonthlyItemRow,
} from "./db/schema";

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  APP_PUBLIC_URL: string;
  AUTH_ISSUER_URL: string;
  AUTH_CLIENT_ID: string;
  OWNER_EMAIL: string;
  DEV_AUTH_EMAIL?: string;
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

/* ── Helpers ─────────────────────────────────────── */

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
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

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }
}

function parseMonthKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return value;
}

function parseCurrency(value: unknown): "USD" | "IDR" {
  if (value === "IDR") return "IDR";
  return "USD";
}

function parseItemType(value: unknown): "income" | "expense" {
  if (value === "income") return "income";
  return "expense";
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getCurrentMonthKey() {
  const now = new Date();
  return getMonthKey(now.getFullYear(), now.getMonth() + 1);
}

/* ── JWKS / Auth ────────────────────────────────── */

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
    access: tokens.access_token,
    refresh: tokens.refresh_token,
    expiresIn: tokens.expires_in,
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

/* ── Handlers ────────────────────────────────────── */

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
  const jsonBody = await response.json().catch(() => null);
  if (!jsonBody || typeof jsonBody !== "object" || Array.isArray(jsonBody))
    return new Response("Invalid token response", { status: 502 });
  const tokens = jsonBody as Record<string, unknown>;
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string" ||
    typeof tokens.expires_in !== "number"
  ) {
    return new Response("Invalid token response", { status: 502 });
  }
  const headers = new Headers({ Location: "/" });
  headers.append(
    "Set-Cookie",
    serializeCookie("auth_access_token", tokens.access_token, { maxAge: tokens.expires_in }),
  );
  headers.append(
    "Set-Cookie",
    serializeCookie("auth_refresh_token", tokens.refresh_token, { maxAge: 60 * 60 * 24 * 365 }),
  );
  return new Response(null, { status: 302, headers });
}

function handleLogout() {
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", serializeCookie("auth_access_token", "", { maxAge: 0 }));
  headers.append("Set-Cookie", serializeCookie("auth_refresh_token", "", { maxAge: 0 }));
  return new Response(null, { status: 302, headers });
}

/* ── Monthly Items ───────────────────────────────── */

async function handleListMonthlyItems(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const monthKey =
    parseMonthKey(new URL(request.url).searchParams.get("month")) ?? getCurrentMonthKey();

  const rows = await db
    .select()
    .from(monthlyItems)
    .orderBy(desc(monthlyItems.sortOrder), monthlyItems.name)
    .all();

  // Get toggle state for the given month
  const toggles = await db
    .select()
    .from(monthlyToggles)
    .where(eq(monthlyToggles.monthKey, monthKey))
    .all();

  const toggleMap = new Map(toggles.map((t) => [t.monthlyItemId, t.active]));

  const items = rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    note: row.note ?? "",
    sortOrder: row.sortOrder,
    active: toggleMap.get(row.id) ?? true, // default active if no toggle set
    createdAt: row.createdAt,
  }));

  return withSessionCookies(json({ items, month: monthKey }), session);
}

async function handleCreateMonthlyItem(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;

  const { name, type, amount, currency, category, note } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) {
    return json({ error: "Name is required" }, { status: 400 });
  }
  if (typeof amount !== "number" || amount <= 0) {
    return json({ error: "Valid amount is required" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Get current max sort order
  const maxRow = await db
    .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
    .from(monthlyItems)
    .get();

  await db.insert(monthlyItems).values({
    id,
    name: name.trim(),
    type: parseItemType(type),
    amount: Math.round(amount),
    currency: parseCurrency(currency),
    category: typeof category === "string" ? category.trim().toLowerCase() || "other" : "other",
    note: typeof note === "string" ? note.trim() : "",
    sortOrder: (maxRow?.max ?? -1) + 1,
    createdAt: now,
  });

  return withSessionCookies(json({ item: { id } }, { status: 201 }), session);
}

async function handleUpdateMonthlyItem(request: Request, env: Env, id: string) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const existing = await db.select().from(monthlyItems).where(eq(monthlyItems.id, id)).get();
  if (!existing) return new Response("Not found", { status: 404 });

  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;

  const updates: Partial<MonthlyItemRow> = {};
  const { name, type, amount, currency, category, note, sortOrder } = body as Record<
    string,
    unknown
  >;

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return json({ error: "Invalid name" }, { status: 400 });
    }
    updates.name = name.trim();
  }
  if (type !== undefined) {
    updates.type = parseItemType(type);
  }
  if (amount !== undefined) {
    if (typeof amount !== "number" || amount <= 0) {
      return json({ error: "Invalid amount" }, { status: 400 });
    }
    updates.amount = Math.round(amount);
  }
  if (currency !== undefined) {
    updates.currency = parseCurrency(currency);
  }
  if (category !== undefined) {
    updates.category =
      typeof category === "string" ? category.trim().toLowerCase() || "other" : "other";
  }
  if (note !== undefined) {
    updates.note = typeof note === "string" ? note.trim() : "";
  }
  if (sortOrder !== undefined) {
    updates.sortOrder = typeof sortOrder === "number" ? sortOrder : existing.sortOrder;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(monthlyItems).set(updates).where(eq(monthlyItems.id, id));
  }

  return withSessionCookies(json({ ok: true }), session);
}

async function handleDeleteMonthlyItem(request: Request, env: Env, id: string) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const existing = await db.select().from(monthlyItems).where(eq(monthlyItems.id, id)).get();
  if (!existing) return new Response("Not found", { status: 404 });

  await db.delete(monthlyItems).where(eq(monthlyItems.id, id));
  return withSessionCookies(json({ ok: true }), session);
}

/* ── Monthly Toggles ─────────────────────────────── */

async function handleToggleMonthlyItem(request: Request, env: Env, id: string) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const url = new URL(request.url);
  const monthKey = parseMonthKey(url.searchParams.get("month")) ?? getCurrentMonthKey();
  const activeParam = url.searchParams.get("active");
  const active = activeParam === "true";

  // Verify the monthly item exists
  const existing = await db.select().from(monthlyItems).where(eq(monthlyItems.id, id)).get();
  if (!existing) return new Response("Not found", { status: 404 });

  // Upsert toggle
  await db
    .insert(monthlyToggles)
    .values({ monthlyItemId: id, monthKey, active })
    .onConflictDoUpdate({
      target: [monthlyToggles.monthlyItemId, monthlyToggles.monthKey],
      set: { active },
    });

  return withSessionCookies(json({ ok: true }), session);
}

/* ── Manual Items ────────────────────────────────── */

async function handleListItems(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const url = new URL(request.url);
  const monthKey = parseMonthKey(url.searchParams.get("month")) ?? getCurrentMonthKey();

  const rows = await db
    .select()
    .from(manualItems)
    .where(eq(manualItems.monthKey, monthKey))
    .orderBy(desc(manualItems.date), desc(manualItems.createdAt))
    .all();

  const items = rows.map((row) => ({
    id: row.id,
    monthlyItemId: row.monthlyItemId,
    name: row.name,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    note: row.note ?? "",
    monthKey: row.monthKey,
    date: row.date,
    createdAt: row.createdAt,
  }));

  return withSessionCookies(json({ items, month: monthKey }), session);
}

async function handleCreateItem(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;

  const { name, type, amount, currency, category, note, monthKey, date, monthlyItemId } =
    body as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) {
    return json({ error: "Name is required" }, { status: 400 });
  }
  if (typeof amount !== "number" || amount <= 0) {
    return json({ error: "Valid amount is required" }, { status: 400 });
  }

  const resolvedMonthKey = parseMonthKey(monthKey) ?? getCurrentMonthKey();
  const resolvedDate =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().slice(0, 10);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(manualItems).values({
    id,
    monthlyItemId: typeof monthlyItemId === "string" ? monthlyItemId : null,
    name: name.trim(),
    type: parseItemType(type),
    amount: Math.round(amount),
    currency: parseCurrency(currency),
    category: typeof category === "string" ? category.trim().toLowerCase() || "other" : "other",
    note: typeof note === "string" ? note.trim() : "",
    monthKey: resolvedMonthKey,
    date: resolvedDate,
    createdAt: now,
  });

  return withSessionCookies(json({ item: { id } }, { status: 201 }), session);
}

async function handleUpdateItem(request: Request, env: Env, id: string) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const existing = await db.select().from(manualItems).where(eq(manualItems.id, id)).get();
  if (!existing) return new Response("Not found", { status: 404 });

  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;

  const updates: Record<string, unknown> = {};
  const { name, type, amount, currency, category, note, date } = body as Record<string, unknown>;

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return json({ error: "Invalid name" }, { status: 400 });
    }
    updates.name = name.trim();
  }
  if (type !== undefined) {
    updates.type = parseItemType(type);
  }
  if (amount !== undefined) {
    if (typeof amount !== "number" || amount <= 0) {
      return json({ error: "Invalid amount" }, { status: 400 });
    }
    updates.amount = Math.round(amount);
  }
  if (currency !== undefined) {
    updates.currency = parseCurrency(currency);
  }
  if (category !== undefined) {
    updates.category =
      typeof category === "string" ? category.trim().toLowerCase() || "other" : "other";
  }
  if (note !== undefined) {
    updates.note = typeof note === "string" ? note.trim() : "";
  }
  if (date !== undefined) {
    updates.date =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : existing.date;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(manualItems).set(updates).where(eq(manualItems.id, id));
  }

  return withSessionCookies(json({ ok: true }), session);
}

async function handleDeleteItem(request: Request, env: Env, id: string) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const existing = await db.select().from(manualItems).where(eq(manualItems.id, id)).get();
  if (!existing) return new Response("Not found", { status: 404 });

  await db.delete(manualItems).where(eq(manualItems.id, id));
  return withSessionCookies(json({ ok: true }), session);
}

/* ── Summary ─────────────────────────────────────── */

async function handleSummary(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const url = new URL(request.url);
  const monthKey = parseMonthKey(url.searchParams.get("month")) ?? getCurrentMonthKey();

  // Get active monthly items for this month
  const mItems = await db
    .select()
    .from(monthlyItems)
    .orderBy(desc(monthlyItems.sortOrder), monthlyItems.name)
    .all();

  const toggles = await db
    .select()
    .from(monthlyToggles)
    .where(eq(monthlyToggles.monthKey, monthKey))
    .all();

  const toggleMap = new Map(toggles.map((t) => [t.monthlyItemId, t.active]));
  const activeMonthlyItems = mItems.filter((item) => toggleMap.get(item.id) ?? true);

  // Get manual items for this month
  const mRows = await db.select().from(manualItems).where(eq(manualItems.monthKey, monthKey)).all();

  // Compute summary
  let totalIncome = 0;
  let totalExpense = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const item of activeMonthlyItems) {
    if (item.type === "income") {
      totalIncome += item.amount;
      incomeCount++;
    } else {
      totalExpense += item.amount;
      expenseCount++;
    }
  }

  for (const item of mRows) {
    if (item.type === "income") {
      totalIncome += item.amount;
      incomeCount++;
    } else {
      totalExpense += item.amount;
      expenseCount++;
    }
  }

  return withSessionCookies(
    json({
      month: monthKey,
      summary: {
        income: totalIncome,
        expense: totalExpense,
        balance: totalIncome - totalExpense,
        incomeCount,
        expenseCount,
      },
    }),
    session,
  );
}

/* ── Exchange Rates ──────────────────────────────── */

async function handleGetRates(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);

  const rate = await db.select().from(exchangeRates).where(eq(exchangeRates.id, "latest")).get();

  return withSessionCookies(
    json({
      usdToIdr: rate?.usdToIdr ?? 16000,
      updatedAt: rate?.updatedAt ?? null,
    }),
    session,
  );
}

async function handleUpdateRates(request: Request, env: Env) {
  const session = await requireOwner(request, env);
  const db = getDb(env);
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;

  const { usdToIdr } = body as Record<string, unknown>;
  if (typeof usdToIdr !== "number" || usdToIdr <= 0) {
    return json({ error: "Invalid rate" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await db
    .insert(exchangeRates)
    .values({ id: "latest", usdToIdr: Math.round(usdToIdr), updatedAt: now })
    .onConflictDoUpdate({
      target: exchangeRates.id,
      set: { usdToIdr: Math.round(usdToIdr), updatedAt: now },
    });

  return withSessionCookies(json({ ok: true }), session);
}

/* ── Categories ──────────────────────────────────── */

async function handleListCategories(_request: Request, env: Env) {
  const session = await requireOwner(_request, env);
  const db = getDb(env);

  const mCategories = await db
    .select({ category: monthlyItems.category })
    .from(monthlyItems)
    .groupBy(monthlyItems.category)
    .orderBy(monthlyItems.category)
    .all();

  const manualCategories = await db
    .select({ category: manualItems.category })
    .from(manualItems)
    .groupBy(manualItems.category)
    .orderBy(manualItems.category)
    .all();

  const allCategories = new Set<string>();
  for (const row of [...mCategories, ...manualCategories]) {
    if (row.category) allCategories.add(row.category);
  }

  return withSessionCookies(json({ categories: Array.from(allCategories).sort() }), session);
}

/* ── Fetch handler ───────────────────────────────── */

async function handleApiRoute(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const method = request.method;

  // Auth
  if (pathname === "/api/auth/login" && method === "GET") return await handleLogin(env);
  if (pathname === "/api/auth/callback" && method === "GET")
    return await handleCallback(request, env);
  if (pathname === "/api/auth/logout" && method === "POST") return handleLogout();
  if (pathname === "/api/session" && method === "GET") return await handleSession(request, env);

  // Monthly items
  if (pathname === "/api/money/monthly-items" && method === "GET")
    return await handleListMonthlyItems(request, env);
  if (pathname === "/api/money/monthly-items" && method === "POST")
    return await handleCreateMonthlyItem(request, env);

  const monthlyItemMatch = pathname.match(/^\/api\/money\/monthly-items\/([^/]+)$/);
  if (monthlyItemMatch) {
    const id = monthlyItemMatch[1]!;
    if (method === "PATCH") return await handleUpdateMonthlyItem(request, env, id);
    if (method === "DELETE") return await handleDeleteMonthlyItem(request, env, id);
  }

  // Toggle monthly item
  const toggleMatch = pathname.match(/^\/api\/money\/monthly-items\/([^/]+)\/toggle$/);
  if (toggleMatch && method === "POST") {
    return await handleToggleMonthlyItem(request, env, toggleMatch[1]!);
  }

  // Manual items
  if (pathname === "/api/money/items" && method === "GET")
    return await handleListItems(request, env);
  if (pathname === "/api/money/items" && method === "POST")
    return await handleCreateItem(request, env);

  const itemMatch = pathname.match(/^\/api\/money\/items\/([^/]+)$/);
  if (itemMatch) {
    const id = itemMatch[1]!;
    if (method === "PATCH") return await handleUpdateItem(request, env, id);
    if (method === "DELETE") return await handleDeleteItem(request, env, id);
  }

  // Summary
  if (pathname === "/api/money/summary" && method === "GET")
    return await handleSummary(request, env);

  // Exchange rates
  if (pathname === "/api/money/rates" && method === "GET")
    return await handleGetRates(request, env);
  if (pathname === "/api/money/rates" && method === "PUT")
    return await handleUpdateRates(request, env);

  // Categories
  if (pathname === "/api/money/categories" && method === "GET")
    return await handleListCategories(request, env);

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname.startsWith("/api/")) {
        const result = await handleApiRoute(request, env, pathname);
        if (result) return result;
        return new Response("Not found", { status: 404 });
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 404) {
        return await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin)));
      }
      return assetResponse;
    } catch (error) {
      if (error instanceof Response) return error;
      console.error(JSON.stringify({ scope: "money-worker", error: String(error) }));
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
