import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { chatApi } from "../definitions";
import { handleSession } from "../../api/session";
import { handleBootstrap } from "../../api/bootstrap";
import { handleModels } from "../../api/models";
import { handleUploadPresign } from "../../api/uploads-presign";
import { handleUploadComplete } from "../../api/uploads-complete";

function wrapHandler(fn: (req: Request) => Promise<Response>) {
  return (ctx: { request: any }) =>
    Effect.gen(function* () {
      const webReq = yield* HttpServerRequest.toWeb(ctx.request);
      const response = yield* Effect.tryPromise(() => fn(webReq));
      return HttpServerResponse.fromWeb(response);
    }).pipe(
      Effect.catch((error: any) => {
        const actual = error.cause ?? error;
        if (actual instanceof Response) {
          return Effect.succeed(HttpServerResponse.fromWeb(actual));
        }
        return Effect.succeed(
          HttpServerResponse.fromWeb(new Response("Internal error", { status: 500 })),
        );
      }),
    );
}

export function createBootstrapGroup() {
  const endpoints = (chatApi as any).groups["bootstrap"].endpoints;
  return (HttpApiBuilder.group as any)(chatApi, "bootstrap", (handlers: any) => {
    handlers.handlers.set("bootstrap", {
      endpoint: endpoints["bootstrap"],
      handler: wrapHandler(handleBootstrap),
      isRaw: true,
      uninterruptible: false,
    });
    handlers.handlers.set("session", {
      endpoint: endpoints["session"],
      handler: wrapHandler(handleSession),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}

export function createModelsGroup() {
  const endpoint = (chatApi as any).groups["models"].endpoints["models"];
  return (HttpApiBuilder.group as any)(chatApi, "models", (handlers: any) => {
    handlers.handlers.set("models", {
      endpoint,
      handler: wrapHandler(handleModels),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}

export function createUploadsGroup() {
  const endpoints = (chatApi as any).groups["uploads"].endpoints;
  return (HttpApiBuilder.group as any)(chatApi, "uploads", (handlers: any) => {
    handlers.handlers.set("presign", {
      endpoint: endpoints["presign"],
      handler: wrapHandler(handleUploadPresign),
      isRaw: true,
      uninterruptible: false,
    });
    handlers.handlers.set("complete", {
      endpoint: endpoints["complete"],
      handler: wrapHandler(handleUploadComplete),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
