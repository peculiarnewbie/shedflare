import { afterAll, destroy, test } from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import assert from "node:assert/strict";
import ChatStack from "./alchemy.run";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

afterAll(live ? destroy() : Effect.void, { stackName: "shedflare-chat-live" });

test.skipIf(!live)(
  "chat worker is reachable",
  { timeout: 120_000 },
  Effect.gen(function* () {
    const deployed = yield* test.deploy(ChatStack);
    const response = yield* Effect.promise(() => fetch(deployed.output.url));
    assert.equal(response.status, 200);
  }),
);
