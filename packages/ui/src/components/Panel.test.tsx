// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { Panel } from "./Panel";
import { panel } from "./panel.styles";
import { renderWithTheme } from "../test/render-with-theme";

describe("Panel", () => {
  test("renders children", () => {
    const view = renderWithTheme(() => <Panel>Panel body</Panel>);
    expect(view.getByText("Panel body")).toBeTruthy();
  });

  test("merges class prop", () => {
    const view = renderWithTheme(() => <Panel class="surface">Inside</Panel>);
    expect(view.getByText("Inside").className).toContain("surface");
  });

  test.each([
    ["none", 0],
    ["sm", 4],
    ["md", 6],
    ["lg", 8],
  ] as const)("padding %s sets padding token", (padding, token) => {
    const [, styleFn] = panel({ padding });
    expect(Object.entries(styleFn())).toContainEqual(["--padding", token]);
  });

  test("elevated variant uses stronger panel background token", () => {
    const [, styleFn] = panel({ elevated: true });
    expect(Object.entries(styleFn())).toContainEqual([
      "--background-color",
      "var(--color_panel-strong)",
    ]);
  });
});
