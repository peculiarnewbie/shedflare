import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { appConfig, authIssuerUrl, physicalName } from "../../infra/alchemy-env.ts";

export const MoneyStack = Alchemy.Stack(
  "ShedflareMoney",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* appConfig("money");
    const e2eAuthEmail = process.env.SHEDFLARE_MONEY_E2E_AUTH_EMAIL;
    const e2eAuthToken = process.env.SHEDFLARE_MONEY_E2E_AUTH_TOKEN;
    const isE2eStage = stage.startsWith("e2e-");

    const uploads = yield* Cloudflare.R2Bucket("UPLOADS", {
      name: physicalName(stage, "money", "uploads"),
    });

    const moneyDb = Cloudflare.D1Database("MONEY_DB", {
      name: physicalName(stage, "money", "db"),
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
      env: {
        UPLOADS: uploads,
        MONEY_DB: moneyDb,
        APP_PUBLIC_URL: config.url,
        AUTH_ISSUER_URL: yield* authIssuerUrl(),
        AUTH_CLIENT_ID: `shedflare-money`,
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
      app: "money" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
      bucketName: uploads.bucketName,
    };
  }),
);

export default MoneyStack;
