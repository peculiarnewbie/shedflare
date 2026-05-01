import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { AuthStack } from "./apps/auth/alchemy.run.ts";
import { ChatStack } from "./apps/chat/alchemy.run.ts";
import { DriveStack } from "./apps/drive/alchemy.run.ts";
import { MoneyStack } from "./apps/money/alchemy.run.ts";
import { YouTubeStack } from "./apps/youtube/alchemy.run.ts";
import { appConfig, loadShedflareConfig } from "./infra/alchemy-config.ts";

/**
 * Root Shedflare suite stack.
 *
 * Deploys all apps in dependency order:
 *   1. Auth (provides OAuth issuer)
 *   2. Drive, Chat, Money (depend on Auth)
 *
 * Each child app's AUTH_ISSUER_URL is wired automatically from the Auth
 * app's URL via env vars. This ensures consistent wiring without modifying
 * the per-app stacks.
 *
 * Standalone per-app deployment (e.g. `alchemy deploy apps/drive/alchemy.run.ts`)
 * is still supported — in that mode, AUTH_ISSUER_URL must be set in
 * `shedflare.config.jsonc` under `vars.<app>.AUTH_ISSUER_URL` or via the
 * `SHEDFLARE_<APP>_AUTH_ISSUER_URL` env var.
 */
export default Alchemy.Stack(
  "Shedflare",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const rootConfig = loadShedflareConfig();
    const authCfg = appConfig(rootConfig, "auth");
    const authUrl = authCfg.url;

    // Wire auth URL into child apps so their standalone stacks pick it up
    // via requireVar() without needing config.jsonc overrides.
    const authEnvVar = (appId: string) => `SHEDFLARE_${appId.toUpperCase()}_AUTH_ISSUER_URL`;
    process.env[authEnvVar("drive")] = authUrl;
    process.env[authEnvVar("chat")] = authUrl;
    process.env[authEnvVar("money")] = authUrl;
    process.env[authEnvVar("youtube")] = authUrl;

    const auth = yield* AuthStack;
    const drive = yield* DriveStack;
    const chat = yield* ChatStack;
    const money = yield* MoneyStack;
    const youtube = yield* YouTubeStack;

    return {
      stage,
      authUrl: auth.url,
      driveUrl: drive.url,
      chatUrl: chat.url,
      moneyUrl: money.url,
      youtubeUrl: youtube.url,
    };
  }),
);
