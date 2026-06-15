import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import {
  type AppId,
  appConfig,
  loadShedflareConfig,
  physicalName,
  requireVar,
} from "../../infra/alchemy-env.ts";

const CLIENT_APPS: AppId[] = ["chat", "drive", "money", "cf-bill", "youtube", "s", "routines"];

export const AuthStack = Alchemy.Stack(
  "ShedflareAuth",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* appConfig("auth");
    const rootConfig = loadShedflareConfig();

    const allowedClients: Record<string, string[]> = {};
    for (const appId of CLIENT_APPS) {
      const app = rootConfig.apps[appId];
      if (!app || app.enabled === false) continue;
      const clientId = `shedflare-${appId}`;
      const origin = `https://${app.subdomain}.${rootConfig.domain}`;
      allowedClients[clientId] = [origin];
    }

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
      env: {
        OPENAUTH_STORAGE: storage,
        APP_PUBLIC_URL: config.url,
        GOOGLE_CLIENT_ID: requireVar(config, "GOOGLE_CLIENT_ID"),
        OWNER_EMAIL: config.ownerEmail,
        ALLOWED_CLIENTS: JSON.stringify(allowedClients),
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
