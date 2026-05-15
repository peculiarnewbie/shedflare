import { afterAll, destroy, test } from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import assert from "node:assert/strict";
import ChatStack from "./alchemy.run";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

afterAll(live ? destroy() : Effect.void, { stackName: "shedflare-chat-live" });

test.skipIf(!live)(
  "chat endpoints respond correctly",
  { timeout: 120_000 },
  Effect.gen(function* () {
    const deployed = yield* test.deploy(ChatStack);
    const base = deployed.output.url;

    const root = yield* Effect.promise(() => fetch(base));
    assert.equal(root.status, 200);

    const login = yield* Effect.promise(() =>
      fetch(`${base}/api/auth/login`, { redirect: "manual" }),
    );
    assert.equal(login.status, 302);

    const bootstrap = yield* Effect.promise(() => fetch(`${base}/api/bootstrap`));
    assert.equal(bootstrap.status, 200);
    const bootstrapBody = (yield* Effect.promise(() => bootstrap.json())) as any;
    assert.equal(bootstrapBody.session, null);
  }),
);
