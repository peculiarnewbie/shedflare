// @ts-nocheck — Tokenami property types resolve when the TS plugin is enabled in consuming apps.
import { defineRecipe } from "../lib/define-recipe";

export const input = defineRecipe({
  "--width": "var(--size_full)",
  "--min-height": 11,
  "--padding-inline": 3,
  "--border": "1px solid",
  "--border-color": "var(--color_line)",
  "--border-radius": "var(--radii_md)",
  "--background-color": "var(--color_bg)",
  "--color": "var(--color_text)",
  "--font-size": "var(--font-size_sm)",
  "--outline": "var(--outline_none)",
  "--transition": "var(--transition_fast)",
  "--focus_border-color": "var(--color_accent)",
});

export const textarea = defineRecipe({
  includes: [input],
  "--padding-block": 3,
  "--min-height": 20,
});
