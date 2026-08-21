# Shedflare workspace guidance

This directory is a local umbrella for independent repositories in the `shedflare` GitHub organization. The umbrella itself is not a Git repository or package-manager workspace.

## Repository layout

- `shedflare/` is the `shedflare/shedflare` repository and the optional suite orchestrator.
- `packages/` contains the independently released shared packages.
- `anki/`, `cf-bill/`, `chat/`, `drive/`, `homepage/`, `links/`, `money/`, and `routines/` are standalone application repositories.
- `auth/` is the optional shared SSO deployment.
- `observability/` is the optional suite observability integration.
- `discord/` is the standalone personal Discord bot.
- `site/` is the public Shedflare project website.

## Isolation rules

- Run Git commands from the intended child repository, never from this umbrella.
- Do not nest one child repository inside another.
- Do not introduce `link:`, `file:`, relative-path, or implicit sibling dependencies.
- Validate shared packages through packed artifacts or published versions.
- Keep every app independently installable, testable, and deployable.
- Treat suite composition as opt-in orchestration over released app artifacts.
- Read each child repository's `AGENTS.md` before changing it.
