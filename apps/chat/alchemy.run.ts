import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import {
  appConfig,
  authIssuerUrl,
  optionalEnv,
  optionalSecretEnv,
  physicalName,
  secretEnv,
} from "../../infra/alchemy-env.ts";

export const ChatStack = Alchemy.Stack(
  "ShedflareChat",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const config = yield* appConfig("chat");

    const uploads = yield* Cloudflare.R2Bucket("UPLOADS", {
      name: physicalName(stage, "chat", "uploads"),
    });

    // Durable Object declared as a binding reference.
    // The actual class (SyncEngineDurableObject) is exported from src/worker.ts
    // and Alchemy bundles it as part of the Worker deploy.
    const syncEngine = Cloudflare.DurableObjectNamespace("SYNC_ENGINE", {
      className: "SyncEngineDurableObject",
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
      },
      env: {
        APP_PUBLIC_URL: config.url,
        AUTH_ISSUER_URL: yield* authIssuerUrl(),
        AUTH_CLIENT_ID: `shedflare-chat`,
        OWNER_EMAIL: config.ownerEmail,
        DEFAULT_MODEL_ID: yield* optionalEnv("DEFAULT_MODEL_ID", "auto"),
        OPENCODE_GO_API_KEY: yield* secretEnv("OPENCODE_GO_API_KEY"),
        UPLOAD_TOKEN_SECRET: yield* secretEnv("UPLOAD_TOKEN_SECRET"),
        EXA_API_KEY: yield* optionalSecretEnv("EXA_API_KEY"),
      },
      domain: config.url.startsWith("https://") ? new URL(config.url).hostname : undefined,
    });

    return {
      app: "chat" as const,
      url: worker.url ?? config.url,
      configuredUrl: config.url,
      workerName: worker.workerName,
      bucketName: uploads.bucketName,
    };
  }),
);

export default ChatStack;
