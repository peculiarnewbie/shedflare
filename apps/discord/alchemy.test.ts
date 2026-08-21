import { make } from "alchemy/Test/Vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import assert from "node:assert/strict";
import DiscordStack from "./alchemy.run";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

const { test, afterAll, deploy, destroy } = make({
  providers: Cloudflare.providers(),
});

afterAll(live ? destroy(DiscordStack) : Effect.void);

test.skipIf(!live)(
  "discord worker is reachable",
  Effect.gen(function* () {
    const deployed = yield* deploy(DiscordStack);
    const url = deployed.url;
    if (!url) throw new Error("Discord deployment did not return a URL");
    const response = yield* Effect.promise(() => fetch(url));
    assert.equal(response.status, 200);
    assert.equal(yield* Effect.promise(() => response.text()), "Shedflare Discord");
  }),
  { timeout: 120_000 },
);
