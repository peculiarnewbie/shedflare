// @ts-nocheck — Tokenami property types resolve when the TS plugin is enabled in consuming apps.
import { defineRecipe } from "../lib/define-recipe";

export const panel = defineRecipe({
  "--background-color": "var(--color_panel)",
  "--border": "1px solid",
  "--border-color": "var(--color_line)",
  "--border-radius": "var(--radii_md)",
  "--box-shadow": "var(--shadow_md)",

  variants: {
    padding: {
      none: { "--padding": 0 },
      sm: { "--padding": 4 },
      md: { "--padding": 6 },
      lg: { "--padding": 8 },
    },
    elevated: {
      true: {
        "--background-color": "var(--color_panel-strong)",
      },
      false: {},
    },
  },
});
