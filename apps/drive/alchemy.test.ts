import { afterAll, destroy, test } from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import assert from "node:assert/strict";
import DriveStack from "./alchemy.run";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

afterAll(live ? destroy() : Effect.void, { stackName: "shedflare-drive-live" });

test.skipIf(!live)(
  "drive endpoints respond correctly",
  { timeout: 120_000 },
  Effect.gen(function* () {
    const deployed = yield* test.deploy(DriveStack);
    const base = deployed.output.url;

    const root = yield* Effect.promise(() => fetch(base));
    assert.equal(root.status, 200);

    const login = yield* Effect.promise(() =>
      fetch(`${base}/api/auth/login`, { redirect: "manual" }),
    );
    assert.equal(login.status, 302);

    const files = yield* Effect.promise(() => fetch(`${base}/api/files`));
    assert.equal(files.status, 401);

    const tags = yield* Effect.promise(() => fetch(`${base}/api/tags`));
    assert.equal(tags.status, 401);

    const session = yield* Effect.promise(() => fetch(`${base}/api/session`));
    assert.equal(session.status, 401);
  }),
);
