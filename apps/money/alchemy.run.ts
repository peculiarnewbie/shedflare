import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import {
  appConfig,
  loadShedflareConfig,
  physicalName,
  requireVar,
} from "../../infra/alchemy-config.ts";

export const MoneyStack = Alchemy.Stack(
  "ShedflareMoney",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = appConfig(loadShedflareConfig(), "money");

    const db = yield* Cloudflare.D1Database("DB", {
      name: physicalName(stage, "money"),
      migrationsDir: "apps/money/src/migrations",
    });

    const worker = yield* Cloudflare.Worker("MoneyWorker", {
      name: physicalName(stage, "money"),
      main: "apps/money/src/worker.ts",
      assets: "apps/money/dist",
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
        AUTH_CLIENT_ID: `shedflare-money`,
        OWNER_EMAIL: config.ownerEmail,
      },
      domain: config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
    });

    return {
      app: "money" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
      dbId: db.databaseId,
    };
  }),
);

export default MoneyStack;
