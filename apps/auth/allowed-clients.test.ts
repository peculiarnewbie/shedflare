import { describe, expect, test } from "vite-plus/test";
import { mergeAdditionalAllowedClients } from "./allowed-clients";

const base = {
  "shedflare-drive": ["https://drive.example.com"],
  "shedflare-money": ["https://money.example.com"],
};

describe("mergeAdditionalAllowedClients", () => {
  test("adds canonical preview origins without replacing production", () => {
    expect(
      mergeAdditionalAllowedClients(
        base,
        JSON.stringify({
          "shedflare-drive": ["https://drive-standalone-preview.example.com"],
        }),
      ),
    ).toEqual({
      "shedflare-drive": [
        "https://drive.example.com",
        "https://drive-standalone-preview.example.com",
      ],
      "shedflare-money": ["https://money.example.com"],
    });
  });

  test("deduplicates origins", () => {
    expect(
      mergeAdditionalAllowedClients(
        base,
        JSON.stringify({ "shedflare-drive": ["https://drive.example.com"] }),
      )["shedflare-drive"],
    ).toEqual(["https://drive.example.com"]);
  });

  test.each([
    ["unknown clients", JSON.stringify({ "shedflare-unknown": ["https://x.example.com"] })],
    ["paths", JSON.stringify({ "shedflare-drive": ["https://preview.example.com/path"] })],
    ["insecure origins", JSON.stringify({ "shedflare-drive": ["http://preview.example.com"] })],
  ])("rejects %s", (_label, value) => {
    expect(() => mergeAdditionalAllowedClients(base, value)).toThrow();
  });
});
