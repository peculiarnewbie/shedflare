// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { render } from "@solidjs/testing-library";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  test("renders empty state message", () => {
    const { getByText } = render(() => <EmptyState />);
    expect(getByText("No files here yet")).toBeTruthy();
    expect(getByText("Upload a file or adjust your search filters.")).toBeTruthy();
  });

  test("renders an SVG icon", () => {
    const { container } = render(() => <EmptyState />);
    const svg = container.querySelector("svg.empty-icon");
    expect(svg).toBeTruthy();
  });
});
