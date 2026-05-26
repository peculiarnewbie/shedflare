import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

/**
 * Wraps a plain (req: Request) => Promise<Response> handler into an Effect-based
 * handler compatible with HttpApiBuilder.group.
 */
export function wrapHandler(fn: (req: Request) => Promise<Response>) {
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
