// @ts-nocheck — Tokenami property types resolve when the TS plugin is enabled in consuming apps.
import { defineRecipe } from "../lib/define-recipe";

export const button = defineRecipe({
  "--display": "var(--display_inline-flex)",
  "--align-items": "var(--align-items_center)",
  "--justify-content": "var(--justify-content_center)",
  "--padding-block": 2,
  "--padding-inline": 4,
  "--border-radius": "var(--radii_md)",
  "--border": "1px solid",
  "--border-color": "var(--color_line)",
  "--background-color": "var(--color_panel)",
  "--color": "var(--color_text)",
  "--font-size": "var(--font-size_sm)",
  "--font-weight": "var(--weight_medium)",
  "--cursor": "var(--cursor_pointer)",
  "--white-space": "var(--white-space_nowrap)",
  "--transition": "var(--transition_fast)",
  "--hover_background-color": "var(--color_panel-strong)",

  variants: {
    variant: {
      default: {},
      primary: {
        "--background-color": "var(--color_accent)",
        "--border-color": "var(--color_accent)",
        "--color": "var(--color_white)",
        "--hover_background-color": "var(--color_accent-hover)",
        "--hover_border-color": "var(--color_accent-hover)",
      },
      danger: {
        "--background-color": "var(--color_danger)",
        "--border-color": "var(--color_danger)",
        "--color": "var(--color_white)",
        "--hover_background-color": "var(--color_danger-hover)",
        "--hover_border-color": "var(--color_danger-hover)",
      },
      ghost: {
        "--background-color": "var(--color_transparent)",
        "--border-color": "var(--color_transparent)",
        "--hover_background-color": "var(--color_panel)",
        "--hover_border-color": "var(--color_line)",
      },
    },
    size: {
      sm: {
        "--padding-block": 1,
        "--padding-inline": 3,
        "--font-size": "var(--font-size_xs)",
      },
      md: {},
      lg: {
        "--padding-block": 3,
        "--padding-inline": 5,
        "--font-size": "var(--font-size_base)",
      },
    },
  },
});
