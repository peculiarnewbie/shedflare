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

export const CfBillStack = Alchemy.Stack(
  "ShedflareCfBill",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = appConfig(loadShedflareConfig(), "cf-bill");

    const secrets = yield* Cloudflare.SecretsStore("ShedflareSecrets");

    const _cfApiToken = yield* Cloudflare.Secret("CF_API_TOKEN", {
      store: secrets,
      value: requireSecretVar("cf-bill", "CF_API_TOKEN"),
    });

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
        AUTH_ISSUER_URL: requireVar(config, "AUTH_ISSUER_URL"),
        AUTH_CLIENT_ID: `shedflare-cf-bill`,
        OWNER_EMAIL: config.ownerEmail,
        CLOUDFLARE_ACCOUNT_ID: requireVar(config, "CLOUDFLARE_ACCOUNT_ID"),
        CLOUDFLARE_ZONE_ID: config.vars.CLOUDFLARE_ZONE_ID ?? "",
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
