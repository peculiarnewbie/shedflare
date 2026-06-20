import { render, type RenderOptions } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import "../../dist/tokenami.css";

export function renderWithTheme(ui: () => JSX.Element, options?: RenderOptions) {
  document.documentElement.setAttribute("data-theme", "night");
  return render(ui, options);
}
