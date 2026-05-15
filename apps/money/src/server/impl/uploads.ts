import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerResponse } from "effect/unstable/http";
import { moneyApi } from "../definitions";
import type { HttpApiAuth } from "@shedflare/auth-client/http-api";

type Env = { UPLOADS: R2Bucket };

export function createUploadsGroup(env: Env, auth: HttpApiAuth) {
  const endpoints = (moneyApi as any).groups["uploads"].endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "uploads", (handlers: any) => {
    handlers.handlers.set("upload", {
      endpoint: endpoints["upload"],
      handler: auth.createProtectedHandler(async (webReq) => {
        const url = new URL(webReq.url);
        const filename = url.searchParams.get("filename") ?? `import-${Date.now()}.csv`;
        await env.UPLOADS.put(filename, webReq.body, {
          httpMetadata: { contentType: "text/csv" },
        });
        return { filename, uploadedAt: new Date().toISOString() };
      }),
      isRaw: false,
      uninterruptible: false,
    });

    handlers.handlers.set("download", {
      endpoint: endpoints["download"],
      handler: auth.createProtectedHandler(async (webReq, _session, ctx) => {
        const key = (ctx as any).params?.key ?? "";
        const object = await env.UPLOADS.get(key);
        if (!object) return HttpServerResponse.fromWeb(new Response("Not found", { status: 404 }));
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        return HttpServerResponse.fromWeb(new Response(object.body as any, { headers }));
      }),
      isRaw: false,
      uninterruptible: false,
    });

    return handlers;
  });
}
