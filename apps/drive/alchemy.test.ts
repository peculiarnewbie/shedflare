import { test } from "vitest";
import assert from "node:assert/strict";

const live = process.env.SHEDFLARE_LIVE_ALCHEMY_TESTS === "1";

test.skipIf(!live)("drive worker is reachable", { timeout: 30_000 }, async () => {
  const response = await fetch("https://drive.peculiarnewbie.com");
  assert.equal(response.status, 200);
});
