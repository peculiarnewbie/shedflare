// @vitest-environment jsdom
import { describe, expect, test, vi } from "vite-plus/test";
import { fireEvent, render } from "@solidjs/testing-library";
import SearchPanel from "./SearchPanel";
import { TestDriveProvider } from "../test/test-context";

describe("SearchPanel", () => {
  test("debounces file searches while keeping the input responsive", () => {
    vi.useFakeTimers();
    const searches: string[] = [];
    const view = render(() => (
      <TestDriveProvider value={{ setSearch: (value) => searches.push(value) }}>
        <SearchPanel />
      </TestDriveProvider>
    ));

    try {
      const input = view.getByPlaceholderText("Search files...") as HTMLInputElement;
      fireEvent.input(input, { target: { value: "v" } });
      fireEvent.input(input, { target: { value: "video" } });

      expect(input.value).toBe("video");
      expect(searches).toEqual([]);
      vi.advanceTimersByTime(249);
      expect(searches).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(searches).toEqual(["video"]);
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });
});
