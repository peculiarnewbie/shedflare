import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { createAuthHandlers, type AuthEnv, type Session } from "./consumer";

export interface HandlerContext {
  params?: Record<string, unknown>;
  payload?: unknown;
}

export function createHttpApiAuth(env: AuthEnv) {
  const auth = createAuthHandlers(env);

  function requireSession(httpReq: HttpServerRequest.HttpServerRequest) {
    return Effect.gen(function* () {
      const webReq = yield* HttpServerRequest.toWeb(httpReq);
      return yield* Effect.tryPromise(() => auth.requireSession(webReq));
    });
  }

  function createProtectedHandler<A>(
    fn: (webReq: Request, session: Session, ctx: HandlerContext) => Promise<A>,
  ) {
    return (ctx: {
      request: HttpServerRequest.HttpServerRequest;
      params?: Record<string, unknown>;
      payload?: unknown;
    }) =>
      Effect.gen(function* () {
        const webReq = yield* HttpServerRequest.toWeb(ctx.request);
        const session = yield* requireSession(ctx.request);
        return yield* Effect.tryPromise(() =>
          fn(webReq, session, { params: ctx.params, payload: ctx.payload }),
        );
      }).pipe(
        Effect.catch((error: unknown) => {
          const actual = error instanceof Error && "cause" in error ? error.cause : error;
          if (actual instanceof Response) {
            return Effect.succeed(HttpServerResponse.fromWeb(actual) as A);
          }
          return Effect.succeed(
            HttpServerResponse.fromWeb(new Response("Internal error", { status: 500 })) as A,
          );
        }),
      );
  }

  return {
    loginRedirect: auth.loginRedirect,
    handleCallback: auth.handleCallback,
    logout: auth.logout,
    sessionEndpoint: auth.sessionEndpoint,
    requireSession,
    withSessionCookies: auth.withSessionCookies,
    createProtectedHandler,
  } as const;
}

export type HttpApiAuth = ReturnType<typeof createHttpApiAuth>;
