import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import {
  appConfig,
  authIssuerUrl,
  optionalEnv,
  physicalName,
  requireEnv,
  secretEnv,
} from "../../infra/alchemy-env.ts";

export const CfBillStack = Alchemy.Stack(
  "ShedflareCfBill",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* appConfig("cf-bill");

    const worker = yield* Cloudflare.Worker("CfBillWorker", {
      name: physicalName(stage, "cf-bill"),
      main: "apps/cf-bill/src/worker.ts",
      assets: "apps/cf-bill/dist/client",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      env: {
        APP_PUBLIC_URL: config.url,
        AUTH_ISSUER_URL: yield* authIssuerUrl(),
        AUTH_CLIENT_ID: `shedflare-cf-bill`,
        OWNER_EMAIL: config.ownerEmail,
        CLOUDFLARE_ACCOUNT_ID: yield* requireEnv("CLOUDFLARE_ACCOUNT_ID"),
        CLOUDFLARE_ZONE_ID: yield* optionalEnv("CLOUDFLARE_ZONE_ID"),
        CF_API_TOKEN: yield* secretEnv("CF_API_TOKEN"),
      },
      domain: config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
    });

    return {
      app: "cf-bill" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
    };
  }),
);

export default CfBillStack;
