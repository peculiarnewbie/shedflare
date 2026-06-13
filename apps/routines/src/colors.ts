/** Shared palette for color-coding routines. Tuned to read well on the dark canvas. */
export const ROUTINE_COLORS = [
  "#2dd4a8", // teal (brand)
  "#5b8def", // blue
  "#a78bfa", // violet
  "#f472b6", // pink
  "#f59e0b", // amber
  "#fb7185", // coral
  "#34d399", // green
  "#22d3ee", // cyan
] as const;

export const DEFAULT_ROUTINE_COLOR = ROUTINE_COLORS[1];
