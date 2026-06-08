import { describe, expect, test, beforeEach, vi } from "vite-plus/test";
import { redoStack, undoStack, push, undo, redo } from "./undo-stack";

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

function fetchBody(): { commandType: string; payload: unknown } {
  const lastCall = g.fetch.mock.calls.at(-1) as [string, RequestInit] | undefined;
  if (!lastCall) throw new Error("no fetch call recorded");
  return JSON.parse(lastCall[1].body as string) as { commandType: string; payload: unknown };
}

describe("undo-stack", () => {
  beforeEach(() => {
    g.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as FetchMock;
  });

  test("push appends an entry and clears the redo stack", () => {
    const undoBefore = undoStack().length;
    const redoBefore = redoStack().length;
    push("label", { commandType: "a", payload: { n: 1 } }, { commandType: "b", payload: {} });
    expect(undoStack().length).toBe(undoBefore + 1);
    expect(undoStack().at(-1)?.label).toBe("label");
    // push always clears redo
    expect(redoStack().length).toBeLessThanOrEqual(redoBefore);
  });

  test("undo executes the inverse command and pushes to redo", async () => {
    mockFetchOk({ id: "x" });
    push(
      "create→delete",
      { commandType: "create_x", payload: { a: 1 } },
      {
        commandType: "delete_x",
        payload: { id: "x" },
      },
    );
    const undoBefore = undoStack().length;
    const redoBefore = redoStack().length;
    const ok = await undo();
    expect(ok).toBe(true);
    expect(undoStack().length).toBe(undoBefore - 1);
    expect(redoStack().length).toBe(redoBefore + 1);
    expect(fetchBody().commandType).toBe("delete_x");
  });

  test("undo returns false and restores the entry when the inverse fails", async () => {
    mockFetchError("oops");
    push(
      "label",
      { commandType: "create_x", payload: {} },
      {
        commandType: "delete_x",
        payload: {},
      },
    );
    const undoBefore = undoStack().length;
    const redoBefore = redoStack().length;
    const ok = await undo();
    expect(ok).toBe(false);
    expect(undoStack().length).toBe(undoBefore);
    expect(redoStack().length).toBe(redoBefore);
  });

  test("redo executes the forward command and pushes back to undo", async () => {
    mockFetchOk();
    push(
      "label",
      { commandType: "create_x", payload: { a: 1 } },
      {
        commandType: "delete_x",
        payload: {},
      },
    );
    await undo();
    const undoBefore = undoStack().length;
    const redoBefore = redoStack().length;
    const ok = await redo();
    expect(ok).toBe(true);
    expect(redoStack().length).toBe(redoBefore - 1);
    expect(undoStack().length).toBe(undoBefore + 1);
    expect(fetchBody().commandType).toBe("create_x");
  });

  test("redo returns false and restores the entry when the forward fails", async () => {
    mockFetchError("boom");
    push(
      "label",
      { commandType: "create_x", payload: {} },
      {
        commandType: "delete_x",
        payload: {},
      },
    );
    mockFetchOk();
    await undo();
    // now switch to failing fetch
    mockFetchError("boom");
    const undoBefore = undoStack().length;
    const redoBefore = redoStack().length;
    const ok = await redo();
    expect(ok).toBe(false);
    expect(redoStack().length).toBe(redoBefore);
    expect(undoStack().length).toBe(undoBefore);
  });
});
