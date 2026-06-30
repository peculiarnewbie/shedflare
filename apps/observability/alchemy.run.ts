import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Shedflare from "@shedflare/alchemy";
import * as Effect from "effect/Effect";

export const ObservabilityStack = Alchemy.Stack(
  "ShedflareObservability",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* Shedflare.appConfig("observability");

    const db = yield* Cloudflare.D1.Database("OBSERVABILITY_DB", {
      name: Shedflare.physicalName(stage, "observability", "db"),
    });

    const worker = yield* Cloudflare.Worker("ObservabilityWorker", {
      name: Shedflare.physicalName(stage, "observability"),
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
      dbName: db.databaseName,
    };
  }),
);

export default ObservabilityStack;
