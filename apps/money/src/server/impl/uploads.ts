import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { wrapHandler } from "./wrap-handler";

type Env = { UPLOADS: R2Bucket };

export function createUploadsGroup(env: Env) {
  return HttpApiBuilder.group(moneyApi, "uploads", (handlers) =>
    handlers
      .handleRaw(
        "upload",
        wrapHandler(async (webReq: Request): Promise<Response> => {
          const url = new URL(webReq.url);
          const filename = url.searchParams.get("filename") ?? `import-${Date.now()}.csv`;
          await env.UPLOADS.put(filename, webReq.body, {
            httpMetadata: { contentType: "text/csv" },
          });
          return new Response(JSON.stringify({ filename, uploadedAt: new Date().toISOString() }), {
            headers: { "content-type": "application/json" },
          });
        }),
      )
      .handleRaw(
        "download",
        wrapHandler(async (webReq: Request): Promise<Response> => {
          const url = new URL(webReq.url);
          const key = url.pathname.replace("/api/upload/", "");
          const object = await env.UPLOADS.get(key);
          if (!object) return new Response("Not found", { status: 404 });
          const headers = new Headers();
          object.writeHttpMetadata(headers);
          return new Response(object.body, { headers });
        }),
      ),
  );
}
