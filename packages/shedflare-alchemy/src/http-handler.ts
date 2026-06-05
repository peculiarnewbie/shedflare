import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, type HttpApi } from "effect/unstable/httpapi";

type WebHandler = {
  handler(request: Request): Promise<Response>;
};

export function createHttpApiWebHandler(
  api: HttpApi.Any,
  groups: ReadonlyArray<Layer.Any>,
): WebHandler {
  const merged = Layer.mergeAll(
    ...(groups as unknown as [Layer.Layer<unknown>, ...Layer.Layer<unknown>[]]),
  );
  const combinedLayer = HttpApiBuilder.layer(api as unknown as HttpApi.HttpApi<string>).pipe(
    Layer.provide(merged),
  );

  return HttpRouter.toWebHandler(combinedLayer) as unknown as WebHandler;
}

/**
 * Wraps a plain `(req: Request) => Promise<Response>` handler into an Effect-based
 * handler compatible with `HttpApiBuilder.group`.
 *
 * Error handling: if the wrapped function throws or returns an error `Response`,
 * the response is surfaced as-is. Any other error becomes a 500 with a logged
 * diagnostic.
 */
export function wrapHttpHandler(fn: (req: Request) => Promise<Response>) {
  return (ctx: { request: HttpServerRequest.HttpServerRequest }) =>
    Effect.gen(function* () {
      const webReq = yield* HttpServerRequest.toWeb(ctx.request);
      const response = yield* Effect.tryPromise(() => fn(webReq));
      return HttpServerResponse.fromWeb(response);
    }).pipe(
      Effect.catch((error: unknown) => {
        const actual = error instanceof Error && "cause" in error ? (error as Error).cause : error;
        if (actual instanceof Response) {
          return Effect.succeed(HttpServerResponse.fromWeb(actual));
        }
        console.error("[wrapHttpHandler] unhandled error", actual);
        return Effect.succeed(
          HttpServerResponse.fromWeb(new Response("Internal error", { status: 500 })),
        );
      }),
    );
}
