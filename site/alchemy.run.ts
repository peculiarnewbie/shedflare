import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { physicalName } from "../infra/alchemy-env.ts";

const SITE_DOMAIN = process.env.SHEDFLARE_SITE_DOMAIN;

export const SiteStack = Alchemy.Stack(
  "ShedflareSite",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;

    const worker = yield* Cloudflare.Worker("SiteWorker", {
      name: physicalName(stage, "site"),
      main: "site/src/worker.ts",
      assets: "site/dist",
      compatibility: {
        date: "2026-05-16",
        flags: ["nodejs_compat"],
      },
      observability: {
        enabled: true,
        headSamplingRate: 1,
      },
      domain: SITE_DOMAIN,
    });

    return {
      app: "site" as const,
      url: worker.url ?? (SITE_DOMAIN ? `https://${SITE_DOMAIN}` : undefined),
      workerName: worker.workerName,
    };
  }),
);

export default SiteStack;
