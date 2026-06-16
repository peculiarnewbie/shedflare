import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { appConfig, authIssuerUrl, physicalName } from "../../infra/alchemy-env.ts";

export const RoutinesStack = Alchemy.Stack(
  "ShedflareRoutines",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* appConfig("routines");

    const db = yield* Cloudflare.D1Database("DB", {
      name: physicalName(stage, "routines"),
      migrationsDir: "apps/routines/src/migrations",
    });

    const worker = yield* Cloudflare.Worker("RoutinesWorker", {
      name: physicalName(stage, "routines"),
      main: "apps/routines/src/worker.ts",
      assets: "apps/routines/dist",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      env: {
        DB: db,
        APP_PUBLIC_URL: config.url,
        AUTH_ISSUER_URL: yield* authIssuerUrl(),
        AUTH_CLIENT_ID: `shedflare-routines`,
        OWNER_EMAIL: config.ownerEmail,
      },
      domain: config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
    });

    return {
      app: "routines" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
      dbId: db.databaseId,
    };
  }),
);

export default RoutinesStack;
