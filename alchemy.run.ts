import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { CloudflareEnvironment } from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AnkiStack } from "./apps/anki/alchemy.run.ts";
import { AuthStack } from "./apps/auth/alchemy.run.ts";
import { CfBillStack } from "./apps/cf-bill/alchemy.run.ts";
import { ChatStack } from "./apps/chat/alchemy.run.ts";
import { DiscordStack } from "./apps/discord/alchemy.run.ts";
import { MoneyStack } from "./apps/money/alchemy.run.ts";
import { ObservabilityStack } from "./apps/observability/alchemy.run.ts";
import { RoutinesStack } from "./apps/routines/alchemy.run.ts";
import { ShortStack } from "./apps/s/alchemy.run.ts";
import { HomepageStack } from "./apps/homepage/alchemy.run.ts";
import { SiteStack } from "./site/alchemy.run.ts";
import * as Shedflare from "./packages/shedflare-alchemy/src/index.ts";

function patchTailConsumers(
  credentials: Shedflare.CfCredentials,
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
          ...Shedflare.cfAuthHeaders(credentials),
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
    const credentials = yield* yield* CloudflareEnvironment;
    const { accountId } = credentials;

    const auth = yield* AuthStack;
    const anki = yield* AnkiStack;
    const cfBill = yield* CfBillStack;
    const chat = yield* ChatStack;
    const discord = yield* DiscordStack;
    const money = yield* MoneyStack;
    const short = yield* ShortStack;
    const routines = yield* RoutinesStack;
    const homepage = yield* HomepageStack;
    const observability = yield* Effect.option(ObservabilityStack);
    const site = yield* SiteStack;

    if (Option.isSome(observability)) {
      const obsWorker = Shedflare.physicalName(stage, "observability");
      const apps = [
        "auth",
        "anki",
        "cf-bill",
        "chat",
        "discord",
        "homepage",
        "money",
        "routines",
        "s",
        "site",
      ] as const;
      for (const app of apps) {
        yield* patchTailConsumers(
          credentials,
          accountId,
          Shedflare.physicalName(stage, app),
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
      authUrl: auth.output.url,
      ankiUrl: anki.output.url,
      homepageUrl: homepage.output.url,
      cfBillUrl: cfBill.output.url,
      chatUrl: chat.output.url,
      discordUrl: discord.output.url,
      moneyUrl: money.output.url,
      shortUrl: short.output.url,
      routinesUrl: routines.output.url,
      siteUrl: site.output.url,
      observabilityUrl: Option.isSome(observability) ? observability.value.output.url : undefined,
    };
  }),
);
