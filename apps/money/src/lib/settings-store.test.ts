import { describe, expect, test, beforeEach, vi } from "vite-plus/test";
import { getSetting, loadSettings, setSetting, settingsCollection } from "./settings-store";

describe("settings-store", () => {
  beforeEach(() => {
    // Reset internal map between tests by clearing known keys
    for (const key of ["display_currency", "number_format", "date_format", "privacy_mode"]) {
      setSetting(key, "");
    }
  });

  test("getSetting returns the fallback for unknown keys", () => {
    expect(getSetting("totally-unknown", "fallback")).toBe("fallback");
  });

  test("setSetting stores and getSetting reads back", () => {
    setSetting("display_currency", "IDR");
    expect(getSetting("display_currency", "USD")).toBe("IDR");
  });

  test("settingsCollection.state.get returns a {key,value} record", () => {
    setSetting("display_currency", "IDR");
    expect(settingsCollection.state.get("display_currency")).toEqual({
      key: "display_currency",
      value: "IDR",
    });
  });

  test("settingsCollection.state.values yields all stored keys", () => {
    setSetting("a", "1");
    setSetting("b", "2");
    const values = settingsCollection.state.values();
    const map = new Map(values.map((v) => [v.key, v.value]));
    expect(map.get("a")).toBe("1");
    expect(map.get("b")).toBe("2");
  });

  test("settingsCollection.get() returns the same shape as state.get()", () => {
    setSetting("k", "v");
    expect(settingsCollection.get("k")).toEqual({ key: "k", value: "v" });
  });

  test("settingsCollection.subscribeChanges notifies on local settings changes", () => {
    let calls = 0;
    const sub = settingsCollection.subscribeChanges(() => {
      calls += 1;
    });
    setSetting("display_currency", "USD");
    sub.unsubscribe();
    setSetting("display_currency", "IDR");
    expect(calls).toBe(1);
  });

  test("loadSettings decodes settings and notifies subscribers", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              settings: [{ id: "s1", key: "privacy_mode", value: "true", updatedAt: "now" }],
            }),
          ),
      ),
    );
    const sub = settingsCollection.subscribeChanges(() => {
      calls += 1;
    });
    try {
      loadSettings();
      await new Promise((r) => setTimeout(r, 0));
      expect(getSetting("privacy_mode", "false")).toBe("true");
      expect(calls).toBe(1);
    } finally {
      sub.unsubscribe();
      vi.unstubAllGlobals();
    }
  });

  test("loadSettings swallows a failing fetch without throwing", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("network down"))),
    );
    try {
      // Fire-and-forget; the .catch inside loadSettings handles the rejection.
      loadSettings();
      expect(true).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
