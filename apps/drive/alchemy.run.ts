import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Shedflare from "@shedflare/alchemy";
import * as Effect from "effect/Effect";

export const DriveStack = Alchemy.Stack(
  "ShedflareDrive",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* Shedflare.appConfig("drive");
    const e2eAuthEmail = process.env.SHEDFLARE_DRIVE_E2E_AUTH_EMAIL;
    const e2eAuthToken = process.env.SHEDFLARE_DRIVE_E2E_AUTH_TOKEN;
    const isE2eStage = stage.startsWith("e2e-");

    const db = yield* Cloudflare.D1.Database("DB", {
      name: Shedflare.physicalName(stage, "drive"),
      migrationsDir: "apps/drive/src/migrations",
    });

    const filesBucket = yield* Cloudflare.R2.Bucket("FILES", {
      name: Shedflare.physicalName(stage, "drive", "files"),
    });

    const worker = yield* Cloudflare.Worker("DriveWorker", {
      name: Shedflare.physicalName(stage, "drive"),
      main: "apps/drive/src/worker.ts",
      assets: "apps/drive/dist",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      env: {
        DB: db,
        FILES: filesBucket,
        APP_PUBLIC_URL: config.url,
        AUTH_ISSUER_URL: yield* Shedflare.authIssuerUrl(),
        AUTH_CLIENT_ID: `shedflare-drive`,
        OWNER_EMAIL: config.ownerEmail,
        ...(e2eAuthEmail && e2eAuthToken
          ? {
              E2E_AUTH_EMAIL: e2eAuthEmail,
              E2E_AUTH_TOKEN: e2eAuthToken,
            }
          : {}),
      },
      domain:
        !isE2eStage && config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
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
