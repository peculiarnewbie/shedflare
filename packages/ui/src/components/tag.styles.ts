// @ts-nocheck — Tokenami property types resolve when the TS plugin is enabled in consuming apps.
import { defineRecipe } from "../lib/define-recipe";

export const tag = defineRecipe({
  "--display": "var(--display_inline-flex)",
  "--align-items": "var(--align-items_center)",
  "--font-size": "var(--font-size_sm)",
  "--padding": 2,
  "--border-radius": "var(--radii_md)",
  "--background-color": "var(--color_accent-soft)",
  "--color": "var(--color_accent-hover)",
  "--border": "1px solid",
  "--border-color": "color-mix(in srgb, var(--color_accent) 25%, transparent)",

  variants: {
    tone: {
      accent: {},
      neutral: {
        "--background-color": "var(--color_panel-strong)",
        "--color": "var(--color_text-secondary)",
        "--border-color": "var(--color_line)",
      },
    },
  },
});
