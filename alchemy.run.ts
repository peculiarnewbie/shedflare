import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { AuthStack } from "./apps/auth/alchemy.run.ts";
import { CfBillStack } from "./apps/cf-bill/alchemy.run.ts";
import { ChatStack } from "./apps/chat/alchemy.run.ts";
import { DriveStack } from "./apps/drive/alchemy.run.ts";
import { MoneyStack } from "./apps/money/alchemy.run.ts";
import { YouTubeStack } from "./apps/youtube/alchemy.run.ts";

/**
 * Root Shedflare suite stack.
 *
 * Deploys all apps in dependency order:
 *   1. Auth (provides OAuth issuer)
 *   2. Drive, Chat, Money (depend on Auth)
 *
 * Each child app derives AUTH_ISSUER_URL from .env's AUTH_ISSUER_URL or the
 * auth app URL implied by SHEDFLARE_DOMAIN.
 */
export default Alchemy.Stack(
  "Shedflare",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;

    const auth = yield* AuthStack;
    const cfBill = yield* CfBillStack;
    const drive = yield* DriveStack;
    const chat = yield* ChatStack;
    const money = yield* MoneyStack;
    const youtube = yield* YouTubeStack;

    return {
      stage,
      authUrl: auth.url,
      cfBillUrl: cfBill.url,
      driveUrl: drive.url,
      chatUrl: chat.url,
      moneyUrl: money.url,
      youtubeUrl: youtube.url,
    };
  }),
);
