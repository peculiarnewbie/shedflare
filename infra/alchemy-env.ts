import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

export type AppId = "auth" | "cf-bill" | "chat" | "drive" | "money" | "youtube";

export interface AppEnvConfig {
  appId: AppId;
  domain: string;
  subdomain: string;
  url: string;
  ownerEmail: string;
}

const defaultSubdomains: Record<AppId, string> = {
  auth: "auth",
  "cf-bill": "cf-bill",
  chat: "chat",
  drive: "drive",
  money: "money",
  youtube: "youtube",
};

export function appConfig(appId: AppId): Effect.Effect<AppEnvConfig> {
  return Effect.gen(function* () {
    const ownerEmail = yield* requireEnv("OWNER_EMAIL");
    const explicitUrl = yield* optionalEnv(appEnvName(appId, "URL"));
    const domain = yield* optionalEnv(
      appEnvName(appId, "DOMAIN"),
      yield* optionalEnv("SHEDFLARE_DOMAIN"),
    );
    const subdomain = yield* optionalEnv(appEnvName(appId, "SUBDOMAIN"), defaultSubdomains[appId]);
    const url = explicitUrl || (domain ? `https://${subdomain}.${domain}` : undefined);

    if (!url) {
      return yield* Effect.fail(
        new Error(
          `Missing URL for ${appId}. Set ${appEnvName(appId, "URL")} in .env, or set SHEDFLARE_DOMAIN for default subdomains.`,
        ),
      );
    }

    return {
      appId,
      domain: new URL(url).hostname,
      subdomain,
      url,
      ownerEmail,
    };
  });
}

export function requireEnv(name: string): Effect.Effect<string> {
  return Config.string(name).pipe(
    Effect.mapError(() => new Error(`Missing env var ${name}. Set it in .env.`)),
  );
}

export function optionalEnv(name: string, fallback = ""): Effect.Effect<string> {
  return Config.string(name).pipe(Config.withDefault(fallback));
}

export function secretEnv(name: string): Effect.Effect<Redacted.Redacted<string>> {
  return Config.redacted(name).pipe(
    Effect.mapError(() => new Error(`Missing secret ${name}. Set it in .env.`)),
  );
}

export function optionalSecretEnv(
  name: string,
  fallback = "",
): Effect.Effect<Redacted.Redacted<string>> {
  return Config.redacted(name).pipe(Config.withDefault(Redacted.make(fallback)));
}

export function authIssuerUrl(): Effect.Effect<string> {
  return Effect.gen(function* () {
    const explicit = yield* optionalEnv("AUTH_ISSUER_URL");
    if (explicit) return explicit;
    return (yield* appConfig("auth")).url;
  });
}

export function physicalName(stage: string | undefined, ...parts: string[]): string {
  const safeStage = (stage || "dev").toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");
  return ["shedflare", safeStage, ...parts].join("-").replaceAll(/-+/g, "-");
}

function appEnvName(appId: AppId, name: string): string {
  return `SHEDFLARE_${appId.toUpperCase().replaceAll("-", "_")}_${name}`;
}
