# Backlog Cleanup & New Plugins Design

Date: 2026-02-24

## Goal

Address all BACKLOG items except Distribution, plus add two new plugins (RSS/Atom feeds and Meta archive import) to stress-test and refine the plugin architecture.

## Core Refactors

### Rename `poll` to `run`

The `poll` command implies recurring network fetching. The Meta archive plugin is a one-time import from a local file. Rename to `run` which works for both cases.

- CLI: `postkeeper run [plugin]` replaces `postkeeper poll [plugin]`
- Plugin interface: `poll(config, context)` renames to `run(config, context)`
- Orchestrator method renames accordingly

### Fix cwd-relative paths

The CLI currently uses `resolve("plugins")` and `loadConfig("config.json")` relative to `process.cwd()`. This only works when run from the project root.

Fix: derive the project root from `import.meta.dirname` (one level up from `src/`). Use that for plugin discovery and config loading.

### Plugins own AS2 conversion

Currently `src/core/as2.js` contains `toAS2()` which is coupled to Instagram's parsed post shape (expects `shortcode`, `timestamp`, `media[].type`, `media[].file`, etc).

Change: each plugin returns fully-formed ActivityStreams 2.0 objects. Core validates required fields before writing:
- `@context` (must be `"https://www.w3.org/ns/activitystreams"`)
- `type` (must be a string)
- `id` (must be a string)
- `published` (must be an ISO 8601 timestamp)
- `attributedTo` (must be an object with `type` and `name`)

The existing `toAS2()` function moves to `plugins/instagram/as2.js`. This also fixes the `href: undefined` bug for unknown platforms (BACKLOG item) since it becomes Instagram-specific code.

### Derive filenames from AS2

The orchestrator currently derives filenames from `activity.shortcode` and `activity.timestamp` (Instagram-specific). Change to derive from AS2 fields:
- Date prefix from `published` field (YYYY-MM-DD)
- Slug from last path segment of `id` URL
- Pattern: `{date}-{slug}.as2.json` / `{date}-{slug}.raw.json` / `{date}-{slug}/`

### Fix downloader logging

`plugins/instagram/downloader.js` uses `console.log`/`console.error` directly instead of `context.log`. Add an optional `log` function parameter.

## Plugin Dependency Management

Each plugin can have its own `package.json` with dependencies. When `postkeeper init <plugin>` runs, it also runs `npm install` inside the plugin directory.

For Playwright: browser binaries are shared globally via the OS-level cache (`~/Library/Caches/ms-playwright/` on macOS). Multiple plugins depending on Playwright will share the same browser install. The npm package duplication (~2MB) is negligible.

## RSS/Atom Plugin

### Config

```json
{
  "plugins": {
    "rss": {
      "feeds": [
        { "url": "https://example.com/feed.xml", "name": "Example Blog" },
        { "url": "https://example.com/atom.xml", "name": "Example Atom" }
      ]
    }
  }
}
```

### Behavior

- `init`: validates feed URLs are reachable, saves initial state
- `run`: fetches each feed, parses XML, converts to AS2, downloads enclosures (podcast audio, images)
- State tracking: stores last-seen `<pubDate>` or `<updated>` per feed to avoid re-processing
- No auth required (public feeds)

### AS2 Mapping

- RSS `<item>` / Atom `<entry>` -> AS2 `Article`
- `<title>` -> `name`
- `<description>` / `<content:encoded>` / `<content>` -> `content`
- `<link>` -> `id` and `url`
- `<pubDate>` / `<published>` -> `published`
- `<author>` / `<dc:creator>` -> `attributedTo`
- `<enclosure>` -> `attachment` (downloaded to archive)
- `<category>` -> `tag`

### Dependencies

- `fast-xml-parser` in plugin-level `package.json` for XML parsing

## Meta Archive Plugin

### Overview

Imports posts from Meta's "Download Your Information" exports. Supports both Facebook and Instagram exports, in both JSON and HTML formats, from both ZIP files and extracted folders.

### Config

```json
{
  "plugins": {
    "meta-archive": {
      "sources": [
        { "path": "~/Downloads/facebook-export.zip", "platform": "facebook" },
        { "path": "~/exports/instagram-export/", "platform": "instagram" }
      ]
    }
  }
}
```

### Behavior

- `init`: validates source paths exist, detects format (JSON/HTML, ZIP/folder)
- `run`: extracts/reads posts, parses into AS2, copies media to archive
- One-time import (not recurring). State tracks which sources have been imported.

### Export Formats

Meta exports come in two formats depending on what the user selected when requesting the download:

**JSON format:**
- Facebook: `your_facebook_activity/posts/your_posts__check_ins__photos_and_videos_1.json`
  - Structure: `[{timestamp, attachments[].data[].media.uri, data[].post, title}]`
- Instagram: `your_instagram_activity/media/posts_1.json`
  - Structure: `[{media[].uri, title, creation_timestamp}]`

**HTML format:**
- Instagram: `your_instagram_activity/media/posts_1.html`
  - Posts in `<div>` blocks with CSS classes: `_a6-h` (caption in `<h2>`), `_a6-o` (timestamp), `_a6_o` (media `<img>`)
  - Parse with regex (structure is very consistent)

### UTF-8 Encoding Fix

Meta exports have a known bug where non-ASCII characters are double-encoded. For example, `ê` (U+00EA) is stored as the byte sequence `\u00c3\u00aa` (the UTF-8 bytes of `ê` interpreted as Latin-1 code points). The plugin decodes this by treating each `\u00xx` escape as a raw byte and re-interpreting as UTF-8.

### AS2 Mapping

- Facebook/Instagram post -> AS2 `Note`
- Caption/post text -> `content`
- Timestamp -> `published`
- Media URIs -> `attachment` (copied from export to archive)
- Platform -> `generator`
- Post ID (derived from media filenames or position) -> `id`

### Dependencies

- `adm-zip` or `yauzl` in plugin-level `package.json` for ZIP reading

## Testing Strategy

- **Core refactors**: update existing tests for rename (`poll` -> `run`), add tests for AS2 validation, test filename derivation from AS2 fields
- **RSS plugin**: unit tests for feed parsing (XML -> AS2), enclosure download, state tracking. Use fixture XML files.
- **Meta archive plugin**: unit tests for JSON parser, HTML parser, UTF-8 fixer, ZIP extraction. Use small fixture files.
- **Plugin dependencies**: test that `npm install` inside plugin dir works in init flow
- **BACKLOG fixes**: test `context.log` passthrough in downloader, test path resolution from `import.meta.dirname`
- **Migration script**: add missing tests (BACKLOG item)

## BACKLOG Items Addressed

| Item | Resolution |
|------|-----------|
| Downloader uses console.log/console.error | Pass `log` function parameter |
| Config path hardcoded as relative | Derive from `import.meta.dirname` |
| `resolve("plugins")` relative to cwd | Derive from `import.meta.dirname` |
| AS2 converter coupled to Instagram | Plugins own AS2 conversion, core validates |
| `href: undefined` for unknown platforms | Fixed when AS2 moves to Instagram plugin |
| No tests for migration script | Add them |
| Instagram integration tests manual | Stays manual (per BACKLOG) |
