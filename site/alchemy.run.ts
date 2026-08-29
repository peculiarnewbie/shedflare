import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { physicalName } from "@shedflare/alchemy";
import * as Effect from "effect/Effect";

const SITE_DOMAINS = process.env.SHEDFLARE_SITE_DOMAIN
  ? process.env.SHEDFLARE_SITE_DOMAIN.split(",").map((domain) => domain.trim())
  : ["shedflare.com", "www.shedflare.com"];

export const SiteStack = Alchemy.Stack(
  "ShedflareSite",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const production = stage === "prod";

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
      url: !production,
      domain: production ? SITE_DOMAINS : undefined,
    });

    return {
      app: "site" as const,
      url: worker.url ?? "https://" + SITE_DOMAINS[0],
      domains: SITE_DOMAINS,
      workerName: worker.workerName,
    };
  }),
);

export default SiteStack;
