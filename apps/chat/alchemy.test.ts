import { make } from "alchemy/Test/Vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import assert from "node:assert/strict";
import ChatStack from "./alchemy.run";
import * as Schema from "effect/Schema";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

const { test, afterAll, deploy, destroy } = make({
  providers: Cloudflare.providers(),
});

afterAll(live ? destroy(ChatStack) : Effect.void);

test.skipIf(!live)(
  "chat endpoints respond correctly",
  Effect.gen(function* () {
    const deployed = yield* deploy(ChatStack);
    assert.ok(deployed.url);
    const base = deployed.url;
    const root = yield* Effect.promise(() => fetch(base));
    assert.equal(root.status, 200);

    const login = yield* Effect.promise(() =>
      fetch(`${base}/api/auth/login`, { redirect: "manual" }),
    );
    assert.equal(login.status, 302);

    const bootstrap = yield* Effect.promise(() => fetch(`${base}/api/bootstrap`));
    assert.equal(bootstrap.status, 200);
    const bootstrapBody = Schema.decodeUnknownSync(Schema.Struct({ session: Schema.Null }))(
      yield* Effect.promise(() => bootstrap.json()),
    );
    assert.equal(bootstrapBody.session, null);
  }),
  { timeout: 120_000 },
);
