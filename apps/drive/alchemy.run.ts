import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { appConfig, authIssuerUrl, physicalName } from "../../infra/alchemy-env.ts";

export const DriveStack = Alchemy.Stack(
  "ShedflareDrive",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* appConfig("drive");

    const db = yield* Cloudflare.D1Database("DB", {
      name: physicalName(stage, "drive"),
      migrationsDir: "apps/drive/src/migrations",
    });

    const filesBucket = yield* Cloudflare.R2Bucket("FILES", {
      name: physicalName(stage, "drive", "files"),
    });

    const worker = yield* Cloudflare.Worker("DriveWorker", {
      name: physicalName(stage, "drive"),
      main: "apps/drive/src/worker.ts",
      assets: "apps/drive/dist/client",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      env: {
        DB: db,
        FILES: filesBucket,
        APP_PUBLIC_URL: config.url,
        AUTH_ISSUER_URL: yield* authIssuerUrl(),
        AUTH_CLIENT_ID: `shedflare-drive`,
        OWNER_EMAIL: config.ownerEmail,
      },
      domain: config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
    });

    return {
      app: "drive" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
      dbId: db.databaseId,
      bucketName: filesBucket.bucketName,
    };
  }),
);

export default DriveStack;
