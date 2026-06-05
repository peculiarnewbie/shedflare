// @ts-nocheck
import { make } from "alchemy/Test/Vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import assert from "node:assert/strict";
import YouTubeStack from "./alchemy.run";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

const { test, afterAll, deploy, destroy } = make({
  providers: Cloudflare.providers(),
});

afterAll(live ? destroy(YouTubeStack) : Effect.void);

test.skipIf(!live)(
  "youtube endpoints respond correctly",
  Effect.gen(function* () {
    const deployed = yield* deploy(YouTubeStack);
    const base = deployed.url;
    const root = yield* Effect.promise(() => fetch(base));
    assert.equal(root.status, 200);

    const login = yield* Effect.promise(() =>
      fetch(`${base}/api/auth/login`, { redirect: "manual" }),
    );
    assert.equal(login.status, 302);

    const dashboard = yield* Effect.promise(() => fetch(`${base}/api/dashboard`));
    assert.equal(dashboard.status, 401);

    const watchLater = yield* Effect.promise(() => fetch(`${base}/api/watch-later`));
    assert.equal(watchLater.status, 401);

    const notifications = yield* Effect.promise(() => fetch(`${base}/api/notifications`));
    assert.equal(notifications.status, 401);

    const session = yield* Effect.promise(() => fetch(`${base}/api/session`));
    assert.equal(session.status, 401);
  }),
  { timeout: 120_000 },
);
