# Shedflare design system

`@shedflare/ui` is the shared Tokenami design system for Shedflare apps. It centralizes the **night** theme (teal accent, DM Sans, dark panels) used by chat, drive, and homepage, and provides typed style recipes plus Solid components.

Apps are **not** using this package yet. This guide covers how to adopt it when you're ready.

## What's in the package

```
packages/ui/
  .tokenami/tokenami.config.ts   # CLI + TypeScript plugin config
  src/
    theme/                       # Shedflare tokens + legacy CSS var bridge
    css.ts                       # createCss() bound to theme
    components/                  # Button, Panel, Input, Tag (+ .styles.ts recipes)
  dist/tokenami.css              # generated — run `pnpm --filter @shedflare/ui build`
```

### Theme tokens

Tokenami emits variables like `--color_bg`, `--color_accent`, `--radii_md`. The theme also defines a **legacy bridge** so existing app CSS keeps working during migration:

| Legacy (app.css today) | Tokenami |
|------------------------|----------|
| `--bg` | `--color_bg` |
| `--panel` | `--color_panel` |
| `--text` | `--color_text` |
| `--accent` | `--color_accent` |
| `--radius` | `--radii_md` |

The bridge is applied on `:root` and `[data-theme='night']` via `globalStyles` in the theme config.

### Components vs recipes

- **Components** (`<Button>`, `<Panel>`, …) — Solid wrappers with variants; best for new UI.
- **Recipes** (`button`, `panel`, … from `*.styles.ts`) — `css.compose()` outputs; use with `style={…}` on existing elements without swapping components yet.

## Prerequisites

Add Tokenami to the repo catalog (already in root `pnpm-workspace.yaml` after setup):

```yaml
catalog:
  "@tokenami/css": ^0.0.98
  "@tokenami/unplugin": ^0.0.98
  tokenami: ^0.0.98
```

Build the stylesheet once:

```bash
pnpm --filter @shedflare/ui build
```

## Adopting in an app

### 1. Dependencies

In `apps/<name>/package.json`:

```json
{
  "dependencies": {
    "@shedflare/ui": "workspace:*"
  },
  "devDependencies": {
    "@tokenami/unplugin": "catalog:",
    "tokenami": "catalog:"
  }
}
```

### 2. App Tokenami config

Create `apps/<name>/.tokenami/tokenami.config.ts`:

```ts
import { shedflareThemeOptions } from "@shedflare/ui/theme";
import { createConfig } from "@tokenami/css";

export default createConfig({
  ...shedflareThemeOptions,
  include: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
});
```

Create `apps/<name>/.tokenami/tokenami.env.d.ts`:

```ts
/// <reference types="@tokenami/css" />
```

### 3. TypeScript

In the app's `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "tokenami" }]
  },
  "include": [".tokenami/tokenami.env.d.ts", "src"]
}
```

Use the workspace TypeScript version in your editor so Tokenami completions work.

### 4. Vite plugin

In `apps/<name>/vite.config.ts`:

```ts
import * as tokenami from "@tokenami/unplugin";

export default defineConfig({
  plugins: [
    tokenami.vite({ output: "src/styles.css" }),
    // …existing plugins
  ],
});
```

Alternatively, use the CLI in `package.json` scripts (no Vite plugin):

```json
{
  "scripts": {
    "styles": "tokenami --output ./src/styles.css",
    "styles:watch": "tokenami --output ./src/styles.css --watch"
  }
}
```

### 5. Import stylesheets

In the app entry (e.g. `entry-client.tsx`), import **in this order**:

```ts
import "@shedflare/ui/tokenami.css"; // shared tokens + reset + legacy bridge
import "./styles.css";               // app-local Tokenami output (from plugin/CLI)
import "./app.css";                  // shrink over time — delete rules as you migrate
```

Set `data-theme="night"` on `<html>` if not already (homepage and chat already do).

### 6. Use components or recipes

**Component:**

```tsx
import { Button, Tag } from "@shedflare/ui";

<Button variant="primary" size="md">Save</Button>
<Tag tone="accent">TypeScript</Tag>
```

**Recipe (inline styles, no component swap):**

```tsx
import { button } from "@shedflare/ui";

const [cn, style] = button({ variant: "primary" });

<button type="button" class={cn()} style={style()}>
  Save
</button>
```

**Ad-hoc layout:**

```tsx
import { css } from "@shedflare/ui/css";

const row = css({
  "--display": "flex",
  "--gap": 4,
  "--align-items": "center",
});
```

Grid numbers are multiples of `0.25rem` (4px). `--gap: 4` → `1rem`.

## Customizing a deployment

Fork owners can theme the whole suite by editing **one file**: `packages/ui/src/theme/index.ts`.

Change `theme.root.color` (e.g. `accent`, `bg`) and rebuild:

```bash
pnpm --filter @shedflare/ui build
```

Future option: inject overrides from `shedflare.config.jsonc` at deploy time into the theme config.

### Hover and focus

The theme uses Tokenami selectors inspired by `@tokenami/ds`:

- `hover` — only on fine pointers, skips `:disabled`
- `focus` — `:focus-visible`

Use in recipes as `--hover_background-color`, `--focus_border-color`, etc.

## Migration strategy

Recommended order:

1. **homepage** — smallest surface; CSS already matches night tokens
2. **drive** — shares chat patterns; good for `Button` / `Input` / `Panel`
3. **chat** — migrate incrementally (auth overlay → sidebar → composer); keep `app.css` until each section moves

Per section:

1. Replace hand-written rules with a recipe or component.
2. Delete duplicated tokens from `app.css` (theme comes from `@shedflare/ui/tokenami.css`).
3. Run `vp check` in the app.

Do **not** mix unscoped new Tokenami styles with old class-based rules on the same element without checking specificity — prefer `style={recipe()}` or shared components.

## Development workflow

| Task | Command |
|------|---------|
| Regenerate shared CSS | `pnpm --filter @shedflare/ui build` |
| Watch shared CSS | `pnpm --filter @shedflare/ui build:watch` |
| Lint + format package | `pnpm --filter @shedflare/ui check` |
| Typecheck + Tokenami validate | `pnpm --filter @shedflare/ui typecheck` |

When changing theme or component recipes, rebuild `@shedflare/ui` before testing in an adopted app.

## References

- [Tokenami docs](https://github.com/tokenami/tokenami)
- [@tokenami/ds](https://github.com/tokenami/tokenami/tree/main/packages/@tokenami-ds) — fluid type, Radix palette (we borrowed infrastructure, not colors)
- peculiarnewbie — original homepage Tokenami experiment (superseded by Shedflare night theme)
