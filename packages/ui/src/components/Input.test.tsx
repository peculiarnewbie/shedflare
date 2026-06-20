// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { Input } from "./Input";
import { renderWithTheme } from "../test/render-with-theme";

describe("Input", () => {
  test("renders a text input", () => {
    const { getByRole } = renderWithTheme(() => <Input placeholder="Name" />);
    expect(getByRole("textbox")).toBeTruthy();
  });

  test("forwards placeholder and value", () => {
    const { getByRole } = renderWithTheme(() => (
      <Input placeholder="Email" value="you@example.com" readOnly />
    ));
    const el = getByRole("textbox") as HTMLInputElement;
    expect(el.placeholder).toBe("Email");
    expect(el.value).toBe("you@example.com");
  });

  test("forwards disabled and type", () => {
    const { container } = renderWithTheme(() => <Input type="password" disabled />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.type).toBe("password");
    expect(el.disabled).toBe(true);
  });

  test("merges class prop", () => {
    const { getByRole } = renderWithTheme(() => <Input class="field" />);
    expect(getByRole("textbox").className).toContain("field");
  });
});
