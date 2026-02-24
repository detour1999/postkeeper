# Backlog

Known gaps and improvement ideas. Not urgent -- tracked here for visibility.

## Code Quality

- [ ] Plugin downloader uses `console.log`/`console.error` instead of `context.log` (`plugins/instagram/downloader.js:15,20`)
- [ ] Config path hardcoded as relative `"config.json"` in CLI -- only works from project root (`src/cli.js:34,48,75`)
- [ ] `resolve("plugins")` in CLI resolves relative to cwd, not project root (`src/cli.js:20,35,49,78`)

## Architecture

- [ ] AS2 converter in core is coupled to Instagram's parsed post shape -- when adding a second plugin, decide whether to move conversion into plugins or formalize the intermediate post format (`src/core/as2.js`)
- [ ] `tag` array includes `href: undefined` for unknown platforms -- should use conditional spread (`src/core/as2.js:38`)

## Distribution

- [ ] Publish to npm registry for `npm install -g postkeeper` (when there's usage demand)

## Testing

- [ ] No tests for migration script (`scripts/migrate-from-instapost.js`)
- [ ] Instagram plugin integration tests are manual only -- consider a mock-based integration test if the plugin interface stabilizes
