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

    const uploads = yield* Cloudflare.R2Bucket("UPLOADS", {
      name: physicalName(stage, "money", "uploads"),
    });

    const budgetDO = Cloudflare.DurableObjectNamespace("BUDGET_DO", {
      className: "MoneyBudgetDO",
    });

    const worker = yield* Cloudflare.Worker("MoneyWorker", {
      name: physicalName(stage, "money"),
      main: "apps/money/src/worker.ts",
      assets: "apps/money/dist/client",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      bindings: {
        UPLOADS: uploads,
        BUDGET_DO: budgetDO,
      },
      env: {
        APP_PUBLIC_URL: config.url,
        AUTH_ISSUER_URL: yield* authIssuerUrl(),
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
      bucketName: uploads.bucketName,
    };
  }),
);

export default MoneyStack;
