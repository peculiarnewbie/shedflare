// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { render } from "@solidjs/testing-library";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  test("renders empty state message", () => {
    const view = render(() => <EmptyState />);
    expect(view.getByText("No files here yet")).toBeTruthy();
    expect(view.getByText("Upload a file or adjust your search filters.")).toBeTruthy();
  });

  test("renders an SVG icon", () => {
    const { container } = render(() => <EmptyState />);
    const svg = container.querySelector("svg.empty-icon");
    expect(svg).toBeTruthy();
  });
});
