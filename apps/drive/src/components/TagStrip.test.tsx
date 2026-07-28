// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { render, fireEvent } from "@solidjs/testing-library";
import TagStrip from "./TagStrip";
import { TestDriveProvider } from "../test/test-context";

describe("TagStrip", () => {
  test("renders All button and tag buttons", () => {
    const view = render(() => (
      <TestDriveProvider
        value={{
          tags: () => [
            { name: "work", count: 3 },
            { name: "personal", count: 1 },
          ],
        }}
      >
        <TagStrip />
      </TestDriveProvider>
    ));
    expect(view.getByText("All")).toBeTruthy();
    expect(view.getByText(/work/)).toBeTruthy();
    expect(view.getByText(/personal/)).toBeTruthy();
  });

  test("All button is active when no tag selected", () => {
    const view = render(() => (
      <TestDriveProvider>
        <TagStrip />
      </TestDriveProvider>
    ));
    const allBtn = view.getByText("All");
    expect(allBtn.classList.contains("active")).toBe(true);
  });

  test("clicking a tag calls setSelectedTag", async () => {
    let selected = "";
    const view = render(() => (
      <TestDriveProvider
        value={{
          tags: () => [{ name: "work", count: 5 }],
          selectedTag: () => "",
          setSelectedTag: (v: string) => {
            selected = v;
          },
        }}
      >
        <TagStrip />
      </TestDriveProvider>
    ));
    fireEvent.click(view.getByText(/work/));
    expect(selected).toBe("work");
  });

  test("tag button is active when selected", () => {
    const view = render(() => (
      <TestDriveProvider
        value={{
          tags: () => [{ name: "work", count: 5 }],
          selectedTag: () => "work",
        }}
      >
        <TagStrip />
      </TestDriveProvider>
    ));
    const tagBtn = view.getByText(/work/);
    expect(tagBtn.classList.contains("active")).toBe(true);
  });

  test("renders tag count", () => {
    const view = render(() => (
      <TestDriveProvider
        value={{
          tags: () => [{ name: "work", count: 42 }],
        }}
      >
        <TagStrip />
      </TestDriveProvider>
    ));
    expect(view.getByText("42")).toBeTruthy();
  });
});
