import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { appConfig, authIssuerUrl, physicalName, secretEnv } from "../../infra/alchemy-env.ts";

export const YouTubeStack = Alchemy.Stack(
  "ShedflareYouTube",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* appConfig("youtube");

    const db = yield* Cloudflare.D1Database("DB", {
      name: physicalName(stage, "youtube"),
      migrationsDir: "apps/youtube/src/migrations",
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
        AUTH_ISSUER_URL: yield* authIssuerUrl(),
        AUTH_CLIENT_ID: `shedflare-youtube`,
        OWNER_EMAIL: config.ownerEmail,
        SYNC_SECRET: yield* secretEnv("SYNC_SECRET"),
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
