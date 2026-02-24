# Project Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CI, branch protection, coverage enforcement, pre-commit hooks, CLAUDE.md, BACKLOG.md, dependabot, and local cron docs to postkeeper.

**Architecture:** All infrastructure/config changes in a single branch, merged as one PR. Branch protection enabled after CI exists. Coverage enforced at 90% line coverage with `c8`, Playwright-dependent code excluded.

**Tech Stack:** GitHub Actions, c8, pre-commit (pre-commit.com), gh CLI

---

### Task 1: Add c8 and Coverage Scripts

**Files:**
- Modify: `package.json`

**Step 1: Install c8**

Run:
```bash
npm install --save-dev c8
```

**Step 2: Add coverage scripts to package.json**

Add to `scripts`:
```json
{
  "test": "node --test tests/",
  "test:coverage": "c8 --check-coverage --lines 90 --branches 80 --functions 80 --exclude='plugins/instagram/index.js' --exclude='tests/**' node --test tests/"
}
```

Also fix version to `0.1.0` (matches cli.js) and add engines:
```json
{
  "version": "0.1.0",
  "engines": { "node": ">=20.11.0" }
}
```

**Step 3: Run tests to verify nothing broke**

Run: `npm test`
Expected: 19 tests pass

**Step 4: Run coverage to see current baseline**

Run: `npm run test:coverage`
Expected: Fails (we're at ~73% lines, need 90%). This is expected -- we'll add tests in Tasks 2-3.

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add c8 for coverage enforcement, fix version, add engines"
```

---

### Task 2: Add Coverage Exclusions for Playwright Code

The `fetchProfilePosts` and `fetchPostDetails` functions in `extractor.js` require a real Playwright browser page. These are tested manually via `postkeeper poll`. Exclude them from coverage.

**Files:**
- Modify: `plugins/instagram/extractor.js`

**Step 1: Add c8 ignore comments**

Add `/* c8 ignore start */` before `fetchProfilePosts` (line 77) and `/* c8 ignore stop */` after `fetchPostDetails` (line 206):

```js
/* c8 ignore start -- requires Playwright browser page, tested manually */
export async function fetchProfilePosts(page, username, lastSeenTimestamp = null) {
  // ... existing code unchanged ...
}

export async function fetchPostDetails(page, shortcode) {
  // ... existing code unchanged ...
}
/* c8 ignore stop */
```

Also fix the header comment from `// src/extractor.js` to `// plugins/instagram/extractor.js`.

**Step 2: Run coverage to check new baseline**

Run: `npm run test:coverage`
Expected: Still fails but closer (~85% lines). We still need tests for downloader.js and cli.js.

**Step 3: Commit**

```bash
git add plugins/instagram/extractor.js
git commit -m "chore: exclude Playwright functions from coverage, fix header comment"
```

---

### Task 3: Write Tests for Downloader

Test `downloadMedia` by mocking `fetch` with a local HTTP server using `node:http`.

**Files:**
- Create: `tests/plugins/instagram/downloader.test.js`

**Step 1: Write the tests**

```js
// tests/plugins/instagram/downloader.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import { downloadMedia } from "../../../plugins/instagram/downloader.js";

describe("downloadMedia", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-downloader-test");
  let server;
  let baseUrl;

  beforeEach(async () => {
    mkdirSync(tmpDir, { recursive: true });
    server = createServer((req, res) => {
      if (req.url === "/fail") {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end("fake-image-data");
    });
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("downloads media items to tmpDir and returns file mappings", async () => {
    const items = [
      { file: "1.jpg", url: `${baseUrl}/photo1.jpg` },
      { file: "2.jpg", url: `${baseUrl}/photo2.jpg` },
    ];
    const result = await downloadMedia(items, tmpDir, "ABC123");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].relativePath, "1.jpg");
    assert.ok(existsSync(result[0].tmpPath));
    assert.strictEqual(readFileSync(result[0].tmpPath, "utf-8"), "fake-image-data");
  });

  test("skips items that fail to download", async () => {
    const items = [
      { file: "1.jpg", url: `${baseUrl}/fail` },
      { file: "2.jpg", url: `${baseUrl}/photo2.jpg` },
    ];
    const result = await downloadMedia(items, tmpDir, "ABC123");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].relativePath, "2.jpg");
  });

  test("creates shortcode subdirectory in tmpDir", async () => {
    const items = [{ file: "1.jpg", url: `${baseUrl}/photo.jpg` }];
    await downloadMedia(items, tmpDir, "XYZ789");
    assert.ok(existsSync(join(tmpDir, "XYZ789")));
  });
});
```

**Step 2: Run the new test**

Run: `node --test tests/plugins/instagram/downloader.test.js`
Expected: 3 tests pass

**Step 3: Run full coverage**

Run: `npm run test:coverage`
Expected: Getting closer to 90%.

**Step 4: Commit**

```bash
git add tests/plugins/instagram/downloader.test.js
git commit -m "test: add downloader tests with local HTTP server"
```

---

### Task 4: Write Tests for CLI

Test CLI commands by importing the action logic. Since `cli.js` uses Commander with inline action handlers, the cleanest approach is to test the CLI as a subprocess using `node:child_process`.

**Files:**
- Create: `tests/cli.test.js`

**Step 1: Write the tests**

```js
// tests/cli.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const cli = resolve(import.meta.dirname, "../src/cli.js");

describe("CLI", () => {
  test("--help shows usage", () => {
    const output = execFileSync("node", [cli, "--help"], { encoding: "utf-8" });
    assert.ok(output.includes("postkeeper"));
    assert.ok(output.includes("list"));
    assert.ok(output.includes("poll"));
  });

  test("--version shows version", () => {
    const output = execFileSync("node", [cli, "--version"], { encoding: "utf-8" });
    assert.match(output.trim(), /^\d+\.\d+\.\d+$/);
  });

  test("list shows installed plugins", () => {
    const output = execFileSync("node", [cli, "list"], { encoding: "utf-8" });
    assert.ok(output.includes("instagram"));
  });

  test("init with unknown plugin fails", () => {
    assert.throws(
      () => execFileSync("node", [cli, "init", "nonexistent"], { encoding: "utf-8" }),
      /not found/i
    );
  });

  test("status with unknown plugin fails", () => {
    assert.throws(
      () => execFileSync("node", [cli, "status", "nonexistent"], { encoding: "utf-8" }),
      /not found/i
    );
  });

  test("poll with unknown plugin fails", () => {
    assert.throws(
      () => execFileSync("node", [cli, "poll", "nonexistent"], { encoding: "utf-8" }),
      /not found/i
    );
  });
});
```

**Step 2: Run the new test**

Run: `node --test tests/cli.test.js`
Expected: 6 tests pass

**Step 3: Run full coverage**

Run: `npm run test:coverage`
Expected: Should now pass 90% threshold (subprocess execution covers cli.js lines).

Note: `c8` tracks coverage for subprocesses spawned by `execFileSync` automatically when the parent process is already instrumented. If coverage for cli.js doesn't show up, we'll wrap the exec calls with `c8` or adjust the approach.

**Step 4: Commit**

```bash
git add tests/cli.test.js
git commit -m "test: add CLI tests via subprocess execution"
```

---

### Task 5: Verify Coverage Passes

**Step 1: Run full coverage check**

Run: `npm run test:coverage`
Expected: PASS with >=90% lines.

If it doesn't pass, identify remaining gaps and add targeted tests or `/* c8 ignore */` comments for genuinely untestable code (e.g., error branches that require specific OS conditions).

**Step 2: No commit needed if passing. If adjustments were needed, commit them.**

---

### Task 6: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create the workflow file**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow with Node 20/22 matrix and coverage"
```

---

### Task 7: Pre-commit Configuration

**Files:**
- Create: `.pre-commit-config.yaml`
- Modify: `CONTRIBUTING.md` (add pre-commit setup instructions)

**Step 1: Create `.pre-commit-config.yaml`**

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-json
      - id: check-merge-conflict
  - repo: local
    hooks:
      - id: tests
        name: run tests
        entry: npm test
        language: system
        pass_filenames: false
        always_run: true
```

**Step 2: Add setup instructions to CONTRIBUTING.md**

Add after the "Testing" section:

```markdown
## Pre-commit Hooks

This project uses [pre-commit](https://pre-commit.com/) to run checks before every commit.

### Setup

```bash
pip install pre-commit   # or: brew install pre-commit
pre-commit install
```

This runs automatically on every `git commit`. To run manually:

```bash
pre-commit run --all-files
```
```

**Step 3: Commit**

```bash
git add .pre-commit-config.yaml CONTRIBUTING.md
git commit -m "chore: add pre-commit hooks for tests and formatting"
```

---

### Task 8: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

**Step 1: Write CLAUDE.md**

```markdown
# CLAUDE.md

## Project

Postkeeper is a local-first personal social media archiver with a plugin system. Instagram is the first (and currently only) plugin.

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
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md for agent session orientation"
```

---

### Task 9: .gitignore, BACKLOG.md, Dependabot

**Files:**
- Modify: `.gitignore`
- Create: `BACKLOG.md`
- Create: `.github/dependabot.yml`

**Step 1: Update .gitignore**

Add to existing `.gitignore`:
```
.DS_Store
coverage/
*.log
```

**Step 2: Create BACKLOG.md**

```markdown
# Backlog

Known gaps and improvement ideas. Not urgent -- just tracked here for visibility.

## Code Quality

- [ ] Plugin downloader uses `console.log`/`console.error` instead of `context.log` (`plugins/instagram/downloader.js:15,20`)
- [ ] Extractor header comment still says `// src/extractor.js` (`plugins/instagram/extractor.js:1`)
- [ ] Config path hardcoded as relative `"config.json"` in CLI -- only works from project root (`src/cli.js:34,48,75`)
- [ ] `resolve("plugins")` in CLI resolves relative to cwd, not project root (`src/cli.js:20,35,49,78`)

## Architecture

- [ ] AS2 converter in core is coupled to Instagram's parsed post shape -- when adding a second plugin, decide whether to move conversion into plugins or formalize the intermediate post format (`src/core/as2.js`)
- [ ] `tag` array includes `href: undefined` for unknown platforms -- should use conditional spread (`src/core/as2.js:38`)

## Testing

- [ ] No tests for migration script (`scripts/migrate-from-instapost.js`)
- [ ] Instagram plugin integration tests are manual only -- consider a mock-based integration test if the plugin interface stabilizes
```

**Step 3: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

**Step 4: Commit**

```bash
git add .gitignore BACKLOG.md .github/dependabot.yml
git commit -m "chore: update gitignore, add BACKLOG.md, add dependabot config"
```

---

### Task 10: Local Cron Docs in README

**Files:**
- Modify: `README.md`

**Step 1: Add scheduling section to README**

Add before the "Limitations" section:

```markdown
## Scheduled Polling

To poll automatically, set up a local cron job. Postkeeper requires a browser session on your machine, so this runs locally (not in CI).

### macOS (launchd)

Create `~/Library/LaunchAgents/com.postkeeper.poll.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.postkeeper.poll</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/postkeeper/src/cli.js</string>
    <string>poll</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/postkeeper</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>6</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/path/to/postkeeper/poll.log</string>
  <key>StandardErrorPath</key>
  <string>/path/to/postkeeper/poll.log</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.postkeeper.poll.plist
```

### Linux (crontab)

```bash
crontab -e
```

Add:
```
0 6 * * * cd /path/to/postkeeper && node src/cli.js poll >> poll.log 2>&1
```

This polls daily at 6 AM. Adjust the schedule as needed.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add scheduled polling instructions to README"
```

---

### Task 11: Push and Create PR

**Step 1: Push the branch**

```bash
git push -u origin project-hardening
```

**Step 2: Create PR**

```bash
gh pr create --title "Project hardening: CI, coverage, branch protection, pre-commit" --body "$(cat <<'EOF'
## Summary
- CI workflow (GitHub Actions) with Node 20/22 matrix and 90% coverage enforcement
- c8 coverage with Playwright code excluded
- Tests for CLI (subprocess) and downloader (local HTTP server)
- Pre-commit hooks via pre-commit.com (tests, whitespace, JSON validation)
- CLAUDE.md for agent session orientation
- BACKLOG.md tracking known gaps
- Dependabot for npm and GitHub Actions updates
- .gitignore additions (.DS_Store, coverage/, *.log)
- Local cron/launchd docs for scheduled polling
- package.json: engines field, version sync

## Test plan
- [ ] CI passes on both Node 20 and 22
- [ ] `npm run test:coverage` passes locally with >=90% lines
- [ ] `pre-commit run --all-files` passes
- [ ] Dependabot creates its first PR within a week

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

### Task 12: Enable Branch Protection

This must happen after the CI workflow has run at least once on main, so the status check name exists.

**Step 1: Merge the PR first** (requires approval since we'll set up protection after)

For this one time, merge directly or have the user approve. Then enable protection:

**Step 2: Enable branch protection via gh API**

```bash
gh api repos/detour1999/postkeeper/branches/main/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["test (20)", "test (22)"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "restrictions": null
}
EOF
```

**Step 3: Verify protection is active**

Run: `gh api repos/detour1999/postkeeper/branches/main/protection`
Expected: JSON showing the protection rules.

**Step 4: Test by trying to push directly to main**

Run: `echo "test" >> /tmp/test.txt` (don't actually push -- just verify the API response confirms protection)
