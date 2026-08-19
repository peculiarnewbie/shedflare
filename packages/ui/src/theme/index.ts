import { legacyVarBridge } from "./legacy-vars";
import { properties } from "./properties";

/**
 * Shedflare design system theme options (spread into app Tokenami configs).
 *
 * Colors and typography match the `night` theme used by chat, drive, and homepage.
 * Infrastructure (grid, selectors, aliases) borrows patterns from @tokenami/ds.
 */
export const shedflareThemeOptions = {
  include: [] satisfies string[],
  grid: "0.25rem",
  responsive: {
    sm: "@media (width >= 40rem)",
    md: "@media (width >= 48rem)",
    lg: "@media (width >= 64rem)",
    xl: "@media (width >= 80rem)",
  },
  themeSelector: (mode: string) => (mode === "root" ? ":root" : `[data-theme=${mode}]`),
  theme: {
    root: {
      color: {
        bg: "#0f1117",
        panel: "#1a1d27",
        "panel-strong": "#232733",
        text: "#e4e4e8",
        "text-secondary": "#7f8394",
        line: "rgba(255, 255, 255, 0.06)",
        accent: "#2dd4a8",
        "accent-hover": "#3ee8bb",
        "accent-soft": "rgba(45, 212, 168, 0.1)",
        danger: "#c73c32",
        "danger-hover": "#b33329",
        white: "#fff",
        transparent: "transparent",
        current: "currentColor",
      },
      radii: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        full: "9999px",
      },
      font: {
        sans: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        handwriting: '"Caveat", cursive',
        mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      },
      "font-size": {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "0.95rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
        "4xl": "2.25rem",
      },
      weight: {
        light: "300",
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
      },
      leading: {
        tight: "1.25",
        normal: "1.5",
        relaxed: "1.625",
      },
      shadow: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.2)",
        md: "0 2px 12px rgba(0, 0, 0, 0.3)",
      },
      transition: {
        fast: "150ms ease",
        base: "200ms ease",
      },
      border: {
        default: "1px solid",
      },
      size: {
        full: "100%",
      },
      display: {
        flex: "flex",
        "inline-flex": "inline-flex",
        block: "block",
        grid: "grid",
        none: "none",
      },
      "align-items": {
        center: "center",
        start: "flex-start",
        end: "flex-end",
        stretch: "stretch",
      },
      "justify-content": {
        center: "center",
        start: "flex-start",
        end: "flex-end",
        between: "space-between",
      },
      outline: {
        none: "none",
      },
      cursor: {
        pointer: "pointer",
        default: "default",
      },
      "white-space": {
        nowrap: "nowrap",
        normal: "normal",
      },
    },
  },
  aliases: {
    bg: ["background-color"],
    p: ["padding"],
    px: ["padding-inline"],
    py: ["padding-block"],
    m: ["margin"],
    mx: ["margin-inline"],
    my: ["margin-block"],
    rounded: ["border-radius"],
    w: ["inline-size"],
    h: ["block-size"],
    text: ["color"],
    font: ["font-family"],
    "font-size": ["font-size"],
    leading: ["line-height"],
    tracking: ["letter-spacing"],
    "gap-x": ["column-gap"],
    "gap-y": ["row-gap"],
  },
  selectors: {
    hover: ["@media (hover: hover) and (pointer: fine)", "&:not(:disabled):hover"],
    focus: "&:focus-visible",
    disabled: "&:disabled",
    active: "&:active",
    "focus-within": "&:focus-within",
    placeholder: "&::placeholder",
    before: "&::before",
    after: "&::after",
  },
  properties,
  globalStyles: {
    "*, *::before, *::after": {
      boxSizing: "border-box",
      margin: 0,
      padding: 0,
    },
    ":root, [data-theme='night']": {
      ...legacyVarBridge,
      fontFamily: "var(--font_sans)",
      background: "var(--color_bg)",
      color: "var(--color_text)",
      WebkitFontSmoothing: "antialiased",
    },
    body: {
      minHeight: "100dvh",
      lineHeight: "1.5",
    },
    "button, input, select, textarea": {
      font: "inherit",
      color: "inherit",
    },
    a: {
      color: "inherit",
      textDecoration: "none",
    },
    img: {
      maxWidth: "100%",
      height: "auto",
    },
  },
};
