import { describe, expect, test } from "vitest";
import { discoverAppIds, loadManifest } from "./config-service";

describe("config service catalog adapter", () => {
  test("derives manifest summaries from the validated core catalog", () => {
    const chat = loadManifest("chat");

    expect(chat).toMatchObject({
      id: "chat",
      lifecycle: "beta",
      category: "productivity",
      dataSensitivity: "high",
    });
    expect(chat?.secretNames).toContain("OPENCODE_GO_API_KEY");
  });

  test("lists the filesystem catalog in deterministic order", () => {
    expect(discoverAppIds()).toEqual([...discoverAppIds()].sort());
    expect(discoverAppIds()).toContain("auth");
  });
});
