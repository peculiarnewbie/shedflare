import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { links } from "../../db/schema";
import { shortApi } from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

export const RESERVED = new Set(["api", "favicon.ico", "robots.txt", "index.html"]);

export function isValidSlug(slug: string): boolean {
  if (slug.length === 0 || slug.length > 64) return false;
  if (RESERVED.has(slug)) return false;
  return /^[a-zA-Z0-9_-]+$/.test(slug);
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function createLinksGroup(env: { DB: D1Database }, auth: HttpApiAuth) {
  const endpoints = (shortApi as any).groups["links"].endpoints;
  return (HttpApiBuilder.group as any)(shortApi, "links", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: auth.createProtectedHandler(async () => {
        const db = drizzle(env.DB);
        const rows = await db.select().from(links).orderBy(desc(links.createdAt)).all();
        return { links: rows };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("create", {
      endpoint: endpoints["create"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        const body = ctx.payload as { slug?: string; url?: string; hidePreview?: boolean } | null;
        if (!body?.slug || !body?.url) {
          return { error: "slug and url are required" } as any;
        }

        const slug = body.slug.trim().toLowerCase();
        const url = body.url.trim();
        const hidePreview = body.hidePreview ?? false;

        if (!isValidSlug(slug)) {
          return {
            error: "Invalid slug. Use alphanumeric, hyphens, underscores (1-64 chars).",
          } as any;
        }
        if (!isValidUrl(url)) {
          return { error: "Invalid URL. Must start with http:// or https://" } as any;
        }

        const db = drizzle(env.DB);
        const existing = await db.select().from(links).where(eq(links.slug, slug)).get();
        if (existing) {
          return { error: `Slug "${slug}" already exists` } as any;
        }

        const now = new Date().toISOString();
        await db.insert(links).values({ slug, url, hidePreview, createdAt: now }).run();
        return { slug, url, hidePreview, createdAt: now };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("remove", {
      endpoint: endpoints["remove"],
      handler: auth.createProtectedHandler(async (_webReq, _session, ctx) => {
        const slug = ctx.params?.slug as string;
        const db = drizzle(env.DB);
        await db.delete(links).where(eq(links.slug, slug)).run();
        return { ok: true };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    return handlers;
  });
}
