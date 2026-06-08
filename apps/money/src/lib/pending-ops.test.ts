import { describe, expect, test, beforeEach, vi } from "vite-plus/test";
import { dispatch } from "./pending-ops";
import { undoStack, redoStack } from "./undo-stack";

type FetchMock = ReturnType<typeof vi.fn>;
interface GlobalWithFetch {
  fetch: FetchMock;
}
const g = globalThis as unknown as GlobalWithFetch;

function mockFetchOk(data: unknown = {}) {
  g.fetch = vi.fn(
    async () => new Response(JSON.stringify({ ok: true, data }), { status: 200 }),
  ) as FetchMock;
}

function mockFetchError(error: string) {
  g.fetch = vi.fn(
    async () => new Response(JSON.stringify({ ok: false, error }), { status: 200 }),
  ) as FetchMock;
}

describe("dispatch", () => {
  beforeEach(() => {
    g.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as FetchMock;
  });

  test("returns an opId and resolves on success", async () => {
    mockFetchOk({ id: "x" });
    const { opId, promise } = dispatch("create_account", { name: "Checking" });
    expect(opId).toMatch(/^op_[0-9a-f]{8}$/);
    await expect(promise).resolves.toBeUndefined();
  });

  test("uses a caller-supplied opId when provided", async () => {
    mockFetchOk();
    const { opId } = dispatch("create_account", { name: "x" }, { opId: "op_custom" });
    expect(opId).toBe("op_custom");
  });

  test("rejects when the command returns ok=false", async () => {
    mockFetchError("validation failed");
    const { promise } = dispatch("create_account", { name: "x" });
    await expect(promise).rejects.toThrow("validation failed");
  });

  test("static undoInfo pushes a static inverse onto the undo stack on success", async () => {
    mockFetchOk();
    const undoBefore = undoStack().length;
    const { promise } = dispatch(
      "create_account",
      { name: "x" },
      {
        undoInfo: {
          label: "undo create account",
          inverse: { commandType: "delete_account", payload: { id: "acct_1" } },
        },
      },
    );
    await promise;
    expect(undoStack().length).toBe(undoBefore + 1);
    expect(undoStack().at(-1)?.label).toBe("undo create account");
    expect(undoStack().at(-1)?.inverse.commandType).toBe("delete_account");
  });

  test("functional undoInfo receives the result data and pushes a derived inverse", async () => {
    mockFetchOk({ id: "acct_new" });
    const undoBefore = undoStack().length;
    const { promise } = dispatch(
      "create_account",
      { name: "x" },
      {
        undoInfo: {
          label: "undo",
          inverse: (data) => ({
            commandType: "delete_account",
            payload: { id: (data as { id: string }).id },
          }),
        },
      },
    );
    await promise;
    expect(undoStack().length).toBe(undoBefore + 1);
    expect(undoStack().at(-1)?.inverse.payload).toEqual({ id: "acct_new" });
  });

  test("does NOT push an undo entry when the command fails", async () => {
    mockFetchError("oops");
    const undoBefore = undoStack().length;
    const { promise } = dispatch(
      "create_account",
      { name: "x" },
      {
        undoInfo: {
          label: "would-be undo",
          inverse: { commandType: "delete_account", payload: { id: "x" } },
        },
      },
    );
    await expect(promise).rejects.toThrow();
    expect(undoStack().length).toBe(undoBefore);
  });

  test("clears the redo stack on a new forward dispatch", async () => {
    mockFetchOk();
    // Simulate a non-empty redo stack
    redoStack();
    const { promise } = dispatch(
      "noop",
      {},
      {
        undoInfo: {
          label: "x",
          inverse: { commandType: "noop", payload: {} },
        },
      },
    );
    await promise;
    // push inside dispatch's then-callback clears redo
    expect(redoStack().length).toBe(0);
  });
});
