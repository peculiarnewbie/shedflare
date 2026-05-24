import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { DeployActionLive } from "../../packages/alchemy/src/Cloudflare/Workers/Deploy.ts";
import { Config } from "effect";
import {
  appConfig,
  loadShedflareConfig,
  physicalName,
  requireVar,
} from "../../infra/alchemy-config.ts";

export const ChatStack = Alchemy.Stack(
  "ShedflareChat",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = appConfig(loadShedflareConfig(), "chat");

    const opencodeGoApiKey = yield* Alchemy.Secret("OPENCODE_GO_API_KEY");
    const uploadTokenSecret = yield* Alchemy.Secret("UPLOAD_TOKEN_SECRET");
    const exaApiKey = yield* Alchemy.Secret(
      "EXA_API_KEY",
      Config.redacted("EXA_API_KEY").pipe(Config.withDefault("")),
    );

    const uploads = yield* Cloudflare.R2Bucket("UPLOADS", {
      name: physicalName(stage, "chat", "uploads"),
    });

    // Durable Object declared as a binding reference.
    // The actual class (SyncEngineDurableObject) is exported from src/worker.ts
    // and Alchemy bundles it as part of the Worker deploy.
    const syncEngine = Cloudflare.DurableObjectNamespace("SYNC_ENGINE", {
      className: "SyncEngineDurableObject",
    });

    // Create the deployment workflow using DeployAction
    const deployAction = yield* DeployAction({
      appDir: "apps/chat",
      stackPath: "apps/chat/alchemy.run.ts",
      force: false,
      skipBuild: false,
    });

    // Durable Object declared as a binding reference.
    // The actual class (SyncEngineDurableObject) is exported from src/worker.ts
    // and Alchemy bundles it as part of the Worker deploy.
    // NOTE: Browser Rendering binding (BROWSER) is not yet supported as an
    // Alchemy resource type. After deploying, manually add the binding:
    //   wrangler secret put BROWSER  (or via Cloudflare Dashboard)
    // Or add it to the Worker's wrangler.jsonc after generation:
    //   "browser": { "binding": "BROWSER" }

    const worker = yield* Cloudflare.Worker("ChatWorker", {
      name: physicalName(stage, "chat"),
      main: "apps/chat/src/worker.ts",
      assets: "apps/chat/dist/client",
      compatibility: {
        date: "2026-03-22",
        flags: ["nodejs_compat"],
      },
      bindings: {
        UPLOADS: uploads,
        SYNC_ENGINE: syncEngine,
        OPENCODE_GO_API_KEY: opencodeGoApiKey,
        UPLOAD_TOKEN_SECRET: uploadTokenSecret,
        EXA_API_KEY: exaApiKey,
      },
      env: {
        APP_PUBLIC_URL: config.url,
        AUTH_ISSUER_URL: requireVar(config, "AUTH_ISSUER_URL"),
        AUTH_CLIENT_ID: `shedflare-chat`,
        OWNER_EMAIL: config.ownerEmail,
        DEFAULT_MODEL_ID: requireVar(config, "DEFAULT_MODEL_ID"),
      },
      domain: config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
    });

    return {
      app: "chat" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
      bucketName: uploads.bucketName,
      deployOutput: deployAction,
    };
  }),
);

export default ChatStack;
