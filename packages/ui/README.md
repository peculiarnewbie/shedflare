# @shedflare/ui

Tokenami-based design system for the Shedflare suite. Shared theme tokens, `css()` utility, and Solid components.

**Not wired into apps yet.** See [docs/design-system.md](../../docs/design-system.md) for adoption steps.

## Quick start (package development)

```bash
pnpm install
pnpm --filter @shedflare/ui build    # generates dist/tokenami.css
pnpm --filter @shedflare/ui check
```

## Exports

| Import                       | Purpose                                   |
| ---------------------------- | ----------------------------------------- |
| `@shedflare/ui`              | Components + `css` + theme                |
| `@shedflare/ui/css`          | `css()` utility bound to Shedflare config |
| `@shedflare/ui/theme`        | `shedflareThemeOptions` — spread into app configs |
| `@shedflare/ui/config`       | Resolved Tokenami config (for tooling)            |
| `@shedflare/ui/tokenami.css` | Generated global stylesheet               |

## Components

- `Button` — `variant`: default \| primary \| danger \| ghost; `size`: sm \| md \| lg
- `Panel` — surface card with optional elevation
- `Input` — text field matching chat/drive forms
- `Tag` — accent or neutral pill

Style recipes (`button`, `panel`, `input`, `tag`) are exported for use without components.
