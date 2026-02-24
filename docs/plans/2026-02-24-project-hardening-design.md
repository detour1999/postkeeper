# Project Hardening Design

## Purpose

Add CI, branch protection, coverage enforcement, pre-commit hooks, agent configuration, and project tracking infrastructure to postkeeper. Makes the repo safe for agentic development workflows where agents work in branches, tests gate merges, and coverage can't regress.

## Components

### 1. CI (GitHub Actions)

Single workflow `.github/workflows/ci.yml`. Runs on push to `main` and all PRs.

- **Matrix**: Node 20.x and 22.x
- **Steps**: checkout, setup-node, `npm ci`, `npm test`, `npm run test:coverage`
- Coverage enforced at 90% line coverage via `c8`
- No Playwright in CI -- unit tests don't need it, Instagram plugin tests are manual

### 2. Branch Protection

Applied to `main` after CI workflow exists:

- Require PR to merge (no direct push)
- Require CI status check to pass
- Require 1 approval
- No force-push
- No branch deletion

### 3. CLAUDE.md

Project-level agent instructions. Points to CONTRIBUTING.md, sets ground rules:

- Run `npm test` before committing
- Work in branches, never push to main directly
- Key file paths for orientation
- Reference design docs in `docs/plans/`

### 4. Pre-commit Hooks (pre-commit.com)

`.pre-commit-config.yaml` with:

- Trailing whitespace and end-of-file fixer (default hooks)
- `npm test` as a local hook

Installation: `pre-commit install` after clone. Documented in CONTRIBUTING.md.

### 5. Package.json Fixes

- `"engines": { "node": ">=20.11.0" }` (minimum for `import.meta.dirname`)
- `c8` added to devDependencies
- `"test:coverage": "c8 --check-coverage --lines 90 node --test tests/"` script
- Version synced to `0.1.0` (pre-1.0, matches cli.js)

### 6. .gitignore Additions

- `.DS_Store`
- `coverage/`
- `*.log`

### 7. BACKLOG.md

Known gaps from code review:

- Downloader has no tests
- `console.log` in plugin downloader instead of `context.log`
- Config path hardcoded as relative in cli.js
- AS2 converter coupled to Instagram post shape
- Extractor header comment still says old path

### 8. Local Cron Docs

Section in README explaining `crontab` / `launchd` setup for scheduled `postkeeper poll`.

### 9. Dependabot

`.github/dependabot.yml` for weekly npm dependency update PRs.

## Constraints

- 90% coverage threshold will require adding tests for currently untested code (downloader, migration script, possibly CLI)
- Branch protection set up last (after CI exists), as the final direct push to main
- `pre-commit` requires Python installed (standard on macOS)

## Rollout Order

1. Add all files and tests in a single branch
2. Push CI workflow directly to main (last direct push)
3. Enable branch protection via `gh api`
4. All future work goes through PRs
