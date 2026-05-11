import { afterAll, destroy, test } from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import assert from "node:assert/strict";
import { test as baseTest } from "vitest";
import MoneyStack from "./alchemy.run";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

if (live) {
  afterAll(destroy(), { stackName: "shedflare-money-live" });
}

if (!live) {
  baseTest.skip("money worker is reachable", () => {});
} else {
  test(
    "money worker is reachable",
    { timeout: 120_000 },
    Effect.gen(function* () {
      const deployed = yield* test.deploy(MoneyStack);
      const response = yield* Effect.promise(() => fetch(deployed.output.url));
      assert.equal(response.status, 200);
    }),
  );
}
