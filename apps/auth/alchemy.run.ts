import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Shedflare from "@shedflare/alchemy";
import * as Effect from "effect/Effect";

const CLIENT_APPS: Shedflare.AppId[] = [
  "chat",
  "drive",
  "money",
  "cf-bill",
  "youtube",
  "s",
  "routines",
];

export const AuthStack = Alchemy.Stack(
  "ShedflareAuth",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* Shedflare.appConfig("auth");
    const rootConfig = Shedflare.loadShedflareConfig();

    const allowedClients: Record<string, string[]> = {};
    for (const appId of CLIENT_APPS) {
      const app = rootConfig.apps[appId];
      if (!app || app.enabled === false) continue;
      const clientId = `shedflare-${appId}`;
      const origin = Shedflare.appStackConfig(rootConfig, appId, stage).url;
      allowedClients[clientId] = [origin];
    }

    const storage = yield* Cloudflare.KV.Namespace("AuthStorage", {
      title: Shedflare.physicalName(stage, "auth", "storage"),
    });

    const worker = yield* Cloudflare.Worker("AuthWorker", {
      name: Shedflare.physicalName(stage, "auth"),
      main: "apps/auth/src/worker.ts",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      env: {
        OPENAUTH_STORAGE: storage,
        APP_PUBLIC_URL: config.url,
        GOOGLE_CLIENT_ID: Shedflare.requireVar(config, "GOOGLE_CLIENT_ID"),
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
