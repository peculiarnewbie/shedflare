import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { appConfig, physicalName, requireVar } from "../../infra/alchemy-env.ts";

export const AuthStack = Alchemy.Stack(
  "ShedflareAuth",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* appConfig("auth");

    const storage = yield* Cloudflare.KVNamespace("AuthStorage", {
      title: physicalName(stage, "auth", "storage"),
    });

    const worker = yield* Cloudflare.Worker("AuthWorker", {
      name: physicalName(stage, "auth"),
      main: "apps/auth/src/worker.ts",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      bindings: {
        OPENAUTH_STORAGE: storage,
      },
      env: {
        APP_PUBLIC_URL: config.url,
        GOOGLE_CLIENT_ID: requireVar(config, "GOOGLE_CLIENT_ID"),
        OWNER_EMAIL: config.ownerEmail,
      },
      domain: config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
    });

    return {
      app: "auth" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
      kvNamespaceId: storage.namespaceId,
    };
  }),
);

export default AuthStack;
