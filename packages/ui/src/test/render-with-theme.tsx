import { render } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import "../../dist/tokenami.css";

export function renderWithTheme(ui: () => JSX.Element, options?: Parameters<typeof render>[1]) {
  document.documentElement.setAttribute("data-theme", "night");
  return render(ui, options);
}
