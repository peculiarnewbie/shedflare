import { describe, expect, test } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { decodeSyncClientEnvelope } from "./sync-utils";

describe("decodeSyncClientEnvelope", () => {
  test("decodes a valid command envelope", async () => {
    const envelope = await Effect.runPromise(
      decodeSyncClientEnvelope(
        JSON.stringify({
          type: "command",
          opId: "op-1",
          clientTs: "2026-08-18T00:00:00.000Z",
          commandType: "create_item",
          payload: { title: "Example" },
        }),
      ),
    );

    expect(envelope).toMatchObject({ type: "command", opId: "op-1" });
  });

  test.each([
    ["malformed JSON", "{"],
    ["unknown discriminator", JSON.stringify({ type: "other" })],
    ["invalid resume sequence", JSON.stringify({ type: "resume", lastServerSeq: "1" })],
  ])("rejects %s", async (_label, input) => {
    const result = await Effect.runPromiseExit(decodeSyncClientEnvelope(input));
    expect(Exit.isFailure(result)).toBe(true);
  });
});
