import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { CloudflareEnvironment } from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { AuthStack } from "./apps/auth/alchemy.run.ts";
import { CfBillStack } from "./apps/cf-bill/alchemy.run.ts";
import { ChatStack } from "./apps/chat/alchemy.run.ts";
import { DriveStack } from "./apps/drive/alchemy.run.ts";
import { MoneyStack } from "./apps/money/alchemy.run.ts";
import { ObservabilityStack } from "./apps/observability/alchemy.run.ts";
import { RoutinesStack } from "./apps/routines/alchemy.run.ts";
import { ShortStack } from "./apps/s/alchemy.run.ts";
import { YouTubeStack } from "./apps/youtube/alchemy.run.ts";
import { HomepageStack } from "./apps/homepage/alchemy.run.ts";
import { SiteStack } from "./site/alchemy.run.ts";
import { physicalName } from "./packages/shedflare-alchemy/src/index.ts";

function patchTailConsumers(
  apiToken: string,
  accountId: string,
  scriptName: string,
  service: string,
) {
  return Effect.tryPromise(() =>
    fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/script-settings`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ tail_consumers: [{ service }] }),
      },
    ).then((r) => r.json()),
  );
}

export default Alchemy.Stack(
  "Shedflare",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const { accountId, apiToken } = yield* CloudflareEnvironment;

    const auth = yield* AuthStack;
    const cfBill = yield* CfBillStack;
    const drive = yield* DriveStack;
    const chat = yield* ChatStack;
    const money = yield* MoneyStack;
    const youtube = yield* YouTubeStack;
    const short = yield* ShortStack;
    const routines = yield* RoutinesStack;
    const homepage = yield* HomepageStack;
    const observability = yield* Effect.option(ObservabilityStack);
    const site = yield* SiteStack;

    if (Option.isSome(observability)) {
      const obsWorker = physicalName(stage, "observability");
      const apps = [
        "auth",
        "cf-bill",
        "chat",
        "drive",
        "homepage",
        "money",
        "routines",
        "s",
        "youtube",
        "site",
      ] as const;
      for (const app of apps) {
        yield* patchTailConsumers(
          Redacted.value(apiToken),
          accountId,
          physicalName(stage, app),
          obsWorker,
        ).pipe(
          Effect.catch((err) =>
            Effect.sync(() =>
              console.error(`[observability] failed to wire tail consumer for ${app}`, err),
            ),
          ),
        );
      }
    } else {
      yield* Effect.sync(() =>
        console.warn("[shedflare] observability app not enabled; tail consumers skipped"),
      );
    }

    return {
      stage,
      authUrl: auth.url,
      homepageUrl: homepage.url,
      cfBillUrl: cfBill.url,
      driveUrl: drive.url,
      chatUrl: chat.url,
      moneyUrl: money.url,
      youtubeUrl: youtube.url,
      shortUrl: short.url,
      routinesUrl: routines.url,
      siteUrl: site.url,
      observabilityUrl: Option.isSome(observability) ? observability.value.url : undefined,
    };
  }),
);
