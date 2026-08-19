// @vitest-environment jsdom
import { describe, expect, test, vi } from "vite-plus/test";
import { fireEvent } from "@solidjs/testing-library";
import { Button } from "./Button";
import { button } from "./button.styles";
import { renderWithTheme } from "../test/render-with-theme";

describe("Button", () => {
  test("renders label text", () => {
    const view = renderWithTheme(() => <Button>Save</Button>);
    expect(view.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  test("defaults to type button", () => {
    const view = renderWithTheme(() => <Button>Go</Button>);
    expect(view.getByRole("button").getAttribute("type")).toBe("button");
  });

  test("forwards type and disabled", () => {
    const view = renderWithTheme(() => (
      <Button type="submit" disabled>
        Submit
      </Button>
    ));
    const el = view.getByRole("button", { name: "Submit" });
    expect(el.getAttribute("type")).toBe("submit");
    expect(el).toHaveProperty("disabled", true);
  });

  test("calls onClick", () => {
    const onClick = vi.fn();
    const view = renderWithTheme(() => <Button onClick={onClick}>Go</Button>);
    fireEvent.click(view.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("merges class prop", () => {
    const view = renderWithTheme(() => <Button class="extra">Go</Button>);
    expect(view.getByRole("button").className).toContain("extra");
  });

  test.each([
    ["default", "Default"],
    ["primary", "Primary"],
    ["danger", "Danger"],
    ["ghost", "Ghost"],
  ] as const)("renders %s variant", (variant, label) => {
    const view = renderWithTheme(() => <Button variant={variant}>{label}</Button>);
    expect(view.getByRole("button", { name: label })).toBeTruthy();
  });

  test.each([
    ["sm", "Small"],
    ["md", "Medium"],
    ["lg", "Large"],
  ] as const)("renders %s size", (size, label) => {
    const view = renderWithTheme(() => <Button size={size}>{label}</Button>);
    expect(view.getByRole("button", { name: label })).toBeTruthy();
  });
});

describe("button recipe", () => {
  test("primary variant sets accent background token", () => {
    const [, styleFn] = button({ variant: "primary" });
    expect(Object.entries(styleFn())).toContainEqual(["--background-color", "var(--color_accent)"]);
  });

  test("ghost variant uses transparent background token", () => {
    const [, styleFn] = button({ variant: "ghost" });
    expect(Object.entries(styleFn())).toContainEqual([
      "--background-color",
      "var(--color_transparent)",
    ]);
  });
});
