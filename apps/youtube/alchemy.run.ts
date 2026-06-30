import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Shedflare from "@shedflare/alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

export const YouTubeStack = Alchemy.Stack(
  "ShedflareYouTube",
  {
    providers: Shedflare.providers().pipe(Layer.provideMerge(Cloudflare.providers())),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* Shedflare.appConfig("youtube");

    const db = yield* Cloudflare.D1.Database("DB", {
      name: Shedflare.physicalName(stage, "youtube"),
      migrationsDir: "apps/youtube/src/migrations",
    });

    const worker = yield* Cloudflare.Worker("YouTubeWorker", {
      name: Shedflare.physicalName(stage, "youtube"),
      main: "apps/youtube/src/worker.ts",
      assets: "apps/youtube/dist",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      env: {
        DB: db,
        APP_PUBLIC_URL: config.url,
        AUTH_ISSUER_URL: yield* Shedflare.authIssuerUrl(),
        AUTH_CLIENT_ID: `shedflare-youtube`,
        OWNER_EMAIL: config.ownerEmail,
      },
      domain: config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
    });

    const syncSecret = yield* Alchemy.Random("SYNC_SECRET");
    const syncFromEnv = yield* Shedflare.optionalSecretConfig("SYNC_SECRET");

    yield* Shedflare.WorkerSecret("SyncSecret", {
      workerName: worker.workerName,
      binding: "SYNC_SECRET",
      value: Option.isSome(syncFromEnv) ? syncFromEnv.value : syncSecret.text,
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
