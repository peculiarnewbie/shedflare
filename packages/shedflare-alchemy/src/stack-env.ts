import * as Effect from "effect/Effect";
import * as Alchemy from "alchemy";
import {
  appStackConfig,
  loadShedflareConfig,
  optionalVar,
  requireVar,
  type AppId,
  type AppStackConfig,
} from "./config.ts";

export type { AppId, AppStackConfig };

export function appConfig(appId: AppId) {
  return Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    return appStackConfig(loadShedflareConfig(), appId, stage);
  });
}

export function authIssuerUrl() {
  return Effect.gen(function* () {
    const explicit = process.env.AUTH_ISSUER_URL;
    if (explicit) return explicit;
    return (yield* appConfig("auth")).url;
  });
}

export { requireVar, optionalVar };
