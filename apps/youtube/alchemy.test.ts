import { afterAll, destroy, test } from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import assert from "node:assert/strict";
import YouTubeStack from "./alchemy.run";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

afterAll(live ? destroy() : Effect.void, { stackName: "shedflare-youtube-live" });

test.skipIf(!live)(
  "youtube endpoints respond correctly",
  { timeout: 120_000 },
  Effect.gen(function* () {
    const deployed = yield* test.deploy(YouTubeStack);
    const base = deployed.output.url;

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
);
