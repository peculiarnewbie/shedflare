// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { Panel } from "./Panel";
import { panel } from "./panel.styles";
import { renderWithTheme } from "../test/render-with-theme";

describe("Panel", () => {
  test("renders children", () => {
    const { getByText } = renderWithTheme(() => <Panel>Panel body</Panel>);
    expect(getByText("Panel body")).toBeTruthy();
  });

  test("merges class prop", () => {
    const { getByText } = renderWithTheme(() => <Panel class="surface">Inside</Panel>);
    expect(getByText("Inside").className).toContain("surface");
  });

  test.each([
    ["none", 0],
    ["sm", 4],
    ["md", 6],
    ["lg", 8],
  ] as const)("padding %s sets padding token", (padding, token) => {
    const [, styleFn] = panel({ padding });
    expect(styleFn()["--padding"]).toBe(token);
  });

  test("elevated variant uses stronger panel background token", () => {
    const [, styleFn] = panel({ elevated: true });
    expect(styleFn()["--background-color"]).toBe("var(--color_panel-strong)");
  });
});
