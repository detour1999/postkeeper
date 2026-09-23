# CLAUDE.md

## Project

Postkeeper is a local-first personal social media archiver with a plugin system. Plugins include Instagram, Facebook, Google Photos, Goodreads, RSS/Atom, and Meta data-export import.

## Quick Reference

- **Run tests:** `npm test`
- **Run with coverage:** `npm run test:coverage`
- **Node minimum:** >=20.11.0
- **Module system:** ES modules (import/export)
- **Test framework:** node:test + node:assert

## Key Paths

- `src/` -- core code (config, CLI, orchestrator, AS2 converter, plugin loader)
- `plugins/` -- plugin implementations (each is a directory with index.js)
- `tests/` -- mirrors src/ and plugins/ structure
- `docs/plans/` -- design docs and implementation plans
- `archive/` -- output directory (gitignored)

## Rules

- Read CONTRIBUTING.md before making changes -- it has the full plugin interface spec and do/don't lists
- Work in branches. Never push directly to main.
- Write tests first (TDD). Run `npm test` before committing.
- Coverage must stay at or above 90% lines. Run `npm run test:coverage` to check.
- Commit frequently with clear messages.
- No new npm dependencies without a good reason. Prefer Node built-ins.

## Architecture

Thin core, fat plugins. Core handles: plugin discovery, CLI routing, poll orchestration, AS2 conversion, state/storage. Plugins handle: auth, fetching, pagination, media downloads, platform-specific logic.

See `docs/plans/2026-02-24-postkeeper-design.md` for the full design.
