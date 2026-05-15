import { afterAll, destroy, test } from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import assert from "node:assert/strict";
import MoneyStack from "./alchemy.run";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

afterAll(live ? destroy() : Effect.void, { stackName: "shedflare-money-live" });

test.skipIf(!live)(
  "money endpoints respond correctly",
  { timeout: 120_000 },
  Effect.gen(function* () {
    const deployed = yield* test.deploy(MoneyStack);
    const base = deployed.output.url;

    const root = yield* Effect.promise(() => fetch(base));
    assert.equal(root.status, 200);

    const login = yield* Effect.promise(() =>
      fetch(`${base}/api/auth/login`, { redirect: "manual" }),
    );
    assert.equal(login.status, 302);

    const session = yield* Effect.promise(() => fetch(`${base}/api/session`));
    assert.equal(session.status, 401);

    const uploadPut = yield* Effect.promise(() => fetch(`${base}/api/upload`, { method: "PUT" }));
    assert.equal(uploadPut.status, 401);

    const uploadGet = yield* Effect.promise(() => fetch(`${base}/api/upload/test.csv`));
    assert.equal(uploadGet.status, 401);

    const doProxy = yield* Effect.promise(() => fetch(`${base}/api/accounts`));
    assert.equal(doProxy.status, 401);
  }),
);
