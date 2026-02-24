# Contributing to Postkeeper

Postkeeper is a personal archiving tool. This guide covers the philosophy, plugin development, and instructions for code agents working on the project.

## Philosophy

**This is a personal tool, not a platform.** Key principles:

- **Local-first.** No servers, no cloud, no accounts. Just files on disk.
- **Use your own login.** Plugins authenticate as you, using your real browser session, API keys, or OAuth tokens. We never impersonate, scrape anonymously, or use leaked credentials.
- **Fat plugins, thin core.** The core handles orchestration, storage layout, and state. Plugins own everything platform-specific: auth, fetching, pagination, media downloading, error handling.
- **YAGNI.** Don't build for hypothetical future requirements. Three similar lines of code is better than a premature abstraction.
- **DRY within a plugin.** Share code within a plugin freely. Share code between plugins only when the duplication is painful and the abstraction is obvious.

## What We Build

- Plugins that archive your own posts from platforms you use
- Personal RSS/Atom feed archivers
- Tools to migrate between archive formats

## What We Don't Build

- Scrapers for other people's content
- Bulk downloaders or mass-targeting tools
- Anything that requires circumventing authentication or rate limits
- Server components, APIs, or web interfaces
- npm-publishable plugin packages (plugins are local directories)

## Plugin Development

### Structure

Each plugin is a directory under `plugins/` with an `index.js` default export:

```
plugins/
  my-plugin/
    index.js          # required: plugin interface
    extractor.js      # optional: parsing logic
    downloader.js     # optional: media fetching
```

### Required Interface

```js
export default {
  name: "my-plugin",
  description: "Archives posts from My Platform",

  async init(config) {
    // First-time setup: browser login, OAuth flow, config validation.
    // Called via: postkeeper init my-plugin
  },

  async poll(config, context) {
    // Fetch new posts, download media to context.tmpDir, return results.
    // Called via: postkeeper poll my-plugin
    //
    // context.state  - previous state (for tracking what's already archived)
    // context.tmpDir - temp directory for media downloads
    // context.log(msg) - log under the plugin's name
    //
    // Return: { posts: [...], state: { ... } }
    // Each post: { activity, raw, media: [{ relativePath, tmpPath }] }
  },
};
```

### Optional Methods

```js
  // Check auth/connectivity. Return { ok: boolean, message: string }.
  // Called automatically before poll (pre-flight) and via: postkeeper status
  async status(config) { ... },

  // Cleanup (close browser contexts, connections, etc.)
  async shutdown() { ... },
```

### Plugin Config

Each plugin gets its own section in `config.json` under `plugins.<name>`. Define whatever config shape makes sense for the platform. Document it in the plugin's section of the README.

### The `activity` Object

The `activity` object returned in each post is converted to ActivityStreams 2.0 by the core. It should include:

- `shortcode` - unique post identifier from the platform
- `timestamp` - ISO 8601 timestamp
- `username` - author's handle
- `caption` - post text/content
- `media` - array of `{ file, media_type }` where media_type is 1 (image), 2 (video), or 8 (carousel)
- `tagged_users` - array of usernames (optional)
- `location` - `{ name }` (optional)
- `alt_text` - accessibility text (optional)
- `like_count`, `comment_count` - engagement numbers (optional)

Look at `plugins/instagram/extractor.js` for a working example.

### Media Downloads

Plugins download media to `context.tmpDir` and return file mappings. The core moves files to the final archive location. This keeps plugins simple and lets the core handle the directory structure.

```js
// In your poll function:
const tmpPath = join(context.tmpDir, "1.jpg");
await downloadFile(url, tmpPath);
media.push({ relativePath: "1.jpg", tmpPath });
```

## Testing

Write tests with `node:test` and `node:assert`. No test frameworks needed.

```bash
npm test                    # run all tests
node --test tests/path.js   # run a specific test file
```

### Test conventions

- Tests go in `tests/` mirroring the source structure (`tests/core/`, `tests/plugins/instagram/`)
- Use temp directories with `beforeEach`/`afterEach` cleanup
- Test pure functions directly. Don't mock what you can construct.
- Plugin integration tests (requiring real auth or network) are manual -- use `postkeeper poll` directly

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

## Instructions for Code Agents

If you're an AI agent working on this codebase:

### Before You Start

1. Read this file and the README
2. Read `docs/plans/2026-02-24-postkeeper-design.md` for architecture context
3. Run `npm test` to verify the current state
4. Understand the boundary: core code is in `src/`, plugin code is in `plugins/`

### Code Style

- ES modules (`import`/`export`), not CommonJS
- Node.js built-in modules preferred over npm packages
- No TypeScript, no build step, no transpilation
- Minimal dependencies. Only add an npm package if the alternative is unreasonable.
- `node:test` for testing, `node:assert` for assertions
- No linter or formatter configured -- just be consistent with existing code

### Do

- Write tests first (TDD). Write the failing test, then the implementation.
- Keep plugins self-contained. A plugin should work with just its directory and the core.
- Use `context.log()` for output inside plugins, not `console.log`.
- Handle platform API changes gracefully -- these plugins scrape and intercept, so things break.
- Commit frequently with clear messages.

### Don't

- Don't modify core code to accommodate a single plugin's quirks. Fix it in the plugin.
- Don't add abstractions until you have three concrete uses for them.
- Don't add npm dependencies to plugins if you can avoid it. Use `fetch`, `node:fs`, etc.
- Don't add config validation or JSON schemas. Config is simple and trusted.
- Don't create wrapper utilities for one-off operations.
- Don't add error handling for scenarios that can't happen in practice.
- Don't refactor existing code unless you're actively working in that area.

### Adding a New Plugin

1. Create `plugins/<name>/index.js` implementing the required interface
2. Add a config section to the README under a new heading
3. Add tests in `tests/plugins/<name>/`
4. Test with `postkeeper init <name>` and `postkeeper poll <name>`
5. Commit the whole plugin as a single logical change
