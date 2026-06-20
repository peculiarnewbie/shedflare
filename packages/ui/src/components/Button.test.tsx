// @vitest-environment jsdom
import { describe, expect, test, vi } from "vite-plus/test";
import { fireEvent } from "@solidjs/testing-library";
import { Button } from "./Button";
import { button } from "./button.styles";
import { renderWithTheme } from "../test/render-with-theme";

describe("Button", () => {
  test("renders label text", () => {
    const { getByRole } = renderWithTheme(() => <Button>Save</Button>);
    expect(getByRole("button", { name: "Save" })).toBeTruthy();
  });

  test("defaults to type button", () => {
    const { getByRole } = renderWithTheme(() => <Button>Go</Button>);
    expect(getByRole("button").getAttribute("type")).toBe("button");
  });

  test("forwards type and disabled", () => {
    const { getByRole } = renderWithTheme(() => (
      <Button type="submit" disabled>
        Submit
      </Button>
    ));
    const el = getByRole("button", { name: "Submit" });
    expect(el.getAttribute("type")).toBe("submit");
    expect(el).toHaveProperty("disabled", true);
  });

  test("calls onClick", () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(() => <Button onClick={onClick}>Go</Button>);
    fireEvent.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("merges class prop", () => {
    const { getByRole } = renderWithTheme(() => <Button class="extra">Go</Button>);
    expect(getByRole("button").className).toContain("extra");
  });

  test.each([
    ["default", "Default"],
    ["primary", "Primary"],
    ["danger", "Danger"],
    ["ghost", "Ghost"],
  ] as const)("renders %s variant", (variant, label) => {
    const { getByRole } = renderWithTheme(() => <Button variant={variant}>{label}</Button>);
    expect(getByRole("button", { name: label })).toBeTruthy();
  });

  test.each([
    ["sm", "Small"],
    ["md", "Medium"],
    ["lg", "Large"],
  ] as const)("renders %s size", (size, label) => {
    const { getByRole } = renderWithTheme(() => <Button size={size}>{label}</Button>);
    expect(getByRole("button", { name: label })).toBeTruthy();
  });
});

describe("button recipe", () => {
  test("primary variant sets accent background token", () => {
    const [, styleFn] = button({ variant: "primary" });
    expect(styleFn()["--background-color"]).toBe("var(--color_accent)");
  });

  test("ghost variant uses transparent background token", () => {
    const [, styleFn] = button({ variant: "ghost" });
    expect(styleFn()["--background-color"]).toBe("var(--color_transparent)");
  });
});
