import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { appConfig, physicalName } from "../../packages/shedflare-alchemy/src/index.ts";

export const ObservabilityStack = Alchemy.Stack(
  "ShedflareObservability",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* appConfig("observability");

    const db = Cloudflare.D1Database("OBSERVABILITY_DB", {
      name: physicalName(stage, "observability", "db"),
    });

    const worker = yield* Cloudflare.Worker("ObservabilityWorker", {
      name: physicalName(stage, "observability"),
      main: "apps/observability/src/worker.ts",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      env: {
        OBSERVABILITY_DB: db,
        OWNER_EMAIL: config.ownerEmail,
      },
      observability: {
        enabled: true,
        headSamplingRate: 1,
      },
    });

    return {
      app: "observability" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
      dbName: db.bindingName,
    };
  }),
);

export default ObservabilityStack;
