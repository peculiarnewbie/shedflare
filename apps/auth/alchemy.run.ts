import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Shedflare from "@shedflare/alchemy";
import * as Effect from "effect/Effect";
import { mergeAdditionalAllowedClients } from "./allowed-clients.ts";

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
    const catalog = Shedflare.discoverManifests(Shedflare.findRepoRoot());
    const clientApps = catalog.appIds.filter(
      (appId): appId is Shedflare.AppId =>
        Shedflare.isAppId(appId) &&
        appId !== "auth" &&
        (catalog.manifests.get(appId)?.dependsOn.includes("auth") ?? false),
    );

    const configuredClients: Record<string, string[]> = {};
    for (const appId of clientApps) {
      const selected =
        rootConfig.configVersion === 1
          ? !!rootConfig.apps[appId] && rootConfig.apps[appId].enabled !== false
          : !!rootConfig.apps[appId];
      if (!selected) continue;
      const clientId = `shedflare-${appId}`;
      const origin = Shedflare.appStackConfig(rootConfig, appId, stage).url;
      configuredClients[clientId] = [origin];
    }
    const allowedClients = mergeAdditionalAllowedClients(
      configuredClients,
      Shedflare.optionalVar(config, "ADDITIONAL_ALLOWED_CLIENTS", "{}"),
    );

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
