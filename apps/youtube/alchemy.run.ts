import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import {
  appConfig,
  loadShedflareConfig,
  physicalName,
  requireSecretVar,
  requireVar,
} from "../../infra/alchemy-config.ts";

export const YouTubeStack = Alchemy.Stack(
  "ShedflareYouTube",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = appConfig(loadShedflareConfig(), "youtube");

    const db = yield* Cloudflare.D1Database("DB", {
      name: physicalName(stage, "youtube"),
      migrationsDir: "apps/youtube/src/migrations",
    });

    const secrets = yield* Cloudflare.SecretsStore("ShedflareSecrets");

    const _syncSecret = yield* Cloudflare.Secret("SYNC_SECRET", {
      store: secrets,
      value: requireSecretVar("youtube", "SYNC_SECRET"),
    });

    const worker = yield* Cloudflare.Worker("YouTubeWorker", {
      name: physicalName(stage, "youtube"),
      main: "apps/youtube/src/worker.ts",
      assets: "apps/youtube/dist",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      bindings: {
        DB: db,
      },
      env: {
        APP_PUBLIC_URL: config.url,
        AUTH_ISSUER_URL: requireVar(config, "AUTH_ISSUER_URL"),
        AUTH_CLIENT_ID: `shedflare-youtube`,
        OWNER_EMAIL: config.ownerEmail,
      },
      domain: config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
    });

    return {
      app: "youtube" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
      dbId: db.databaseId,
    };
  }),
);

export default YouTubeStack;
