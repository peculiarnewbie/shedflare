/**
 * Maps legacy Shedflare CSS variables (--bg, --accent, …) to Tokenami theme
 * variables (--color_bg, --color_accent, …) for gradual app migration.
 */
export const legacyVarBridge = {
  "--bg": "var(--color_bg)",
  "--panel": "var(--color_panel)",
  "--panel-strong": "var(--color_panel-strong)",
  "--text": "var(--color_text)",
  "--text-secondary": "var(--color_text-secondary)",
  "--line": "var(--color_line)",
  "--accent": "var(--color_accent)",
  "--accent-hover": "var(--color_accent-hover)",
  "--accent-soft": "var(--color_accent-soft)",
  "--radius": "var(--radii_md)",
  "--radius-lg": "var(--radii_lg)",
  "--radius-sm": "var(--radii_sm)",
  "--font": "var(--font_sans)",
} as const;
