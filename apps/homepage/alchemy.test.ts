// @ts-nocheck
import { make } from "alchemy/Test/Vitest";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import assert from "node:assert/strict";
import HomepageStack from "./alchemy.run";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

const { test, afterAll, deploy, destroy } = make({
  providers: Cloudflare.providers(),
});

afterAll(live ? destroy(HomepageStack) : Effect.void);

test.skipIf(!live)(
  "homepage endpoints respond correctly",
  Effect.gen(function* () {
    const deployed = yield* deploy(HomepageStack);
    const base = deployed.url;

    const root = yield* Effect.promise(() => fetch(base));
    assert.equal(root.status, 200);

    const profile = yield* Effect.promise(() => fetch(`${base}/api/profile`));
    assert.equal(profile.status, 200);
    const profileData = yield* Effect.promise(() => profile.json() as any);
    assert.ok(profileData.name);

    const experiences = yield* Effect.promise(() => fetch(`${base}/api/experiences`));
    assert.equal(experiences.status, 200);

    const projects = yield* Effect.promise(() => fetch(`${base}/api/projects`));
    assert.equal(projects.status, 200);

    const login = yield* Effect.promise(() =>
      fetch(`${base}/api/auth/login`, { redirect: "manual" }),
    );
    assert.equal(login.status, 302);

    const session = yield* Effect.promise(() => fetch(`${base}/api/session`));
    assert.equal(session.status, 401);

    const notFound = yield* Effect.promise(() => fetch(`${base}/nonexistent`));
    assert.equal(notFound.status, 200);
  }),
  { timeout: 120_000 },
);
