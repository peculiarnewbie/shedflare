// @vitest-environment jsdom
import { describe, expect, test } from "vite-plus/test";
import { Input } from "./Input";
import { renderWithTheme } from "../test/render-with-theme";

describe("Input", () => {
  test("renders a text input", () => {
    const view = renderWithTheme(() => <Input placeholder="Name" />);
    expect(view.getByRole("textbox")).toBeTruthy();
  });

  test("forwards placeholder and value", () => {
    const view = renderWithTheme(() => (
      <Input placeholder="Email" value="you@example.com" readOnly />
    ));
    const el = view.getByRole<HTMLInputElement>("textbox");
    expect(el.placeholder).toBe("Email");
    expect(el.value).toBe("you@example.com");
  });

  test("forwards disabled and type", () => {
    const { container } = renderWithTheme(() => <Input type="password" disabled />);
    const el = container.querySelector<HTMLInputElement>("input");
    expect(el).not.toBeNull();
    if (!el) throw new Error("Expected a rendered input");
    expect(el.type).toBe("password");
    expect(el.disabled).toBe(true);
  });

  test("merges class prop", () => {
    const view = renderWithTheme(() => <Input class="field" />);
    expect(view.getByRole("textbox").className).toContain("field");
  });
});
