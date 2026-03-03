# Backlog

Known gaps and improvement ideas. Not urgent -- tracked here for visibility.

## Code Quality

- [x] Plugin downloader uses `console.log`/`console.error` instead of `context.log` -- fixed
- [x] Config path hardcoded as relative `"config.json"` in CLI -- fixed (uses `import.meta.dirname`)
- [x] `resolve("plugins")` in CLI resolves relative to cwd, not project root -- fixed

## Architecture

- [x] AS2 converter in core is coupled to Instagram's parsed post shape -- fixed (plugins own AS2 conversion)
- [x] `tag` array includes `href: undefined` for unknown platforms -- fixed (moved to Instagram plugin)

## Distribution

- [ ] Publish to npm registry for `npm install -g postkeeper` (when there's usage demand)

## Testing

- [x] No tests for migration script (`scripts/migrate-from-instapost.js`) -- added
- [ ] Instagram plugin integration tests are manual only -- consider a mock-based integration test if the plugin interface stabilizes
