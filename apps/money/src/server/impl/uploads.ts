import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { wrapHandler } from "./wrap-handler";

type Env = { UPLOADS: R2Bucket };

export function createUploadsGroup(env: Env) {
  const endpoints = (moneyApi as any).groups["uploads"].endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "uploads", (handlers: any) => {
    handlers.handlers.set("upload", {
      endpoint: endpoints["upload"],
      handler: wrapHandler(async (webReq: Request): Promise<Response> => {
        const url = new URL(webReq.url);
        const filename = url.searchParams.get("filename") ?? `import-${Date.now()}.csv`;
        await env.UPLOADS.put(filename, webReq.body, {
          httpMetadata: { contentType: "text/csv" },
        });
        return new Response(JSON.stringify({ filename, uploadedAt: new Date().toISOString() }), {
          headers: { "content-type": "application/json" },
        });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("download", {
      endpoint: endpoints["download"],
      handler: wrapHandler(async (webReq: Request): Promise<Response> => {
        const url = new URL(webReq.url);
        const key = url.pathname.replace("/api/upload/", "");
        const object = await env.UPLOADS.get(key);
        if (!object) return new Response("Not found", { status: 404 });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        return new Response(object.body as any, { headers });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    return handlers;
  });
}
