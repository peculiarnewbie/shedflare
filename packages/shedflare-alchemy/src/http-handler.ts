import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder, type HttpApi } from "effect/unstable/httpapi";

export function createHttpApiWebHandler(
  api: HttpApi.AnyWithProps,
  groups: ReadonlyArray<Layer.Any>,
) {
  const [firstGroup, ...remainingGroups] = groups;
  const apiLayer = HttpApiBuilder.layer(api);
  const combinedLayer = firstGroup
    ? apiLayer.pipe(Layer.provide([firstGroup, ...remainingGroups]))
    : apiLayer;

  // SAFETY: the supplied group layers implement the API services; the Web handler supplies its
  // platform services when materializing the router.
  return HttpRouter.toWebHandler(combinedLayer as Layer.Layer<never, never, HttpRouter.HttpRouter>);
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
      Effect.catch((error) => {
        const actual = error instanceof Error && "cause" in error ? error.cause : error;
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
