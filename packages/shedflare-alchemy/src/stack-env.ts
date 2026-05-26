import * as Effect from "effect/Effect";
import {
  appStackConfig,
  loadShedflareConfig,
  optionalVar,
  requireVar,
  type AppId,
  type AppStackConfig,
} from "./config.ts";

export type { AppId, AppStackConfig };

export function appConfig(appId: AppId): Effect.Effect<AppStackConfig> {
  return Effect.sync(() => appStackConfig(loadShedflareConfig(), appId));
}

export function authIssuerUrl(): Effect.Effect<string> {
  return Effect.gen(function* () {
    const explicit = process.env.AUTH_ISSUER_URL;
    if (explicit) return explicit;
    return (yield* appConfig("auth")).url;
  });
}

export { requireVar, optionalVar };
