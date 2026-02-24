# Postkeeper Design

## Purpose

A local-first personal social media archiver with a plugin system. Each plugin handles a different platform (Instagram, Bluesky, RSS, etc.). Posts are normalized to ActivityStreams 2.0 for interoperability, with raw platform data preserved alongside.

## Architecture

Node.js CLI ("postkeeper") with a thin core that handles plugin discovery, orchestration, storage layout, and state management. Plugins own their entire platform-specific workflow: authentication, fetching, pagination, media downloading.

### Core Responsibilities

- Plugin discovery: scan `plugins/` for directories with `index.js`
- CLI dispatch: route commands to the right plugin(s)
- Poll orchestration: load state, create tmp dir, call plugin, move media to archive, write AS2 + raw JSON, save state
- Auto pre-flight: run `status()` before `poll()`, skip plugins that fail with a warning
- Logging: timestamped output

### Plugin Responsibilities

- Authentication / session management (Playwright, OAuth, API keys, etc.)
- Fetching posts (API calls, scraping, RSS parsing, etc.)
- Pagination and incremental fetching
- Media downloading (handles CDN tokens, auth cookies, etc.)
- Normalizing posts to ActivityStreams 2.0 format
- Preserving raw platform data

## Plugin Interface

Each plugin is a directory under `plugins/` with an `index.js` that default-exports:

```js
export default {
  name: "instagram",
  description: "Instagram profile archiver",

  // First-time setup: auth, config validation, etc.
  // Called via: postkeeper init instagram
  async init(config) { ... },

  // Check connectivity / auth validity
  // Called via: postkeeper status [instagram]
  // Also called automatically before poll as pre-flight
  // Optional - core skips if not implemented
  async status(config) {
    return { ok: true, message: "Session valid" }
  },

  // Fetch new posts, download media, return results
  // Called via: postkeeper poll [instagram]
  async poll(config, context) { ... },

  // Optional cleanup (close browser contexts, etc.)
  async shutdown() { ... },
}
```

### Poll Context

The `context` object passed to `poll`:

- `context.state` - last saved state for this plugin (opaque to core)
- `context.tmpDir` - temporary directory for media downloads
- `context.log(msg)` - logging

### Poll Return Value

```js
{
  posts: [
    {
      activity: { /* ActivityStreams 2.0 object */ },
      raw: { /* original platform JSON */ },
      media: [
        { relativePath: "1.jpg", tmpPath: "/tmp/xxx/1.jpg" }
      ]
    }
  ],
  state: { /* updated state, saved as-is by core */ }
}
```

## CLI Commands

```
postkeeper init <plugin>         # first-time plugin setup
postkeeper poll [plugin]         # poll one or all plugins (auto pre-flight)
postkeeper status [plugin]       # check connectivity/auth
postkeeper list                  # show installed plugins
```

## Data Format

### ActivityStreams 2.0

Posts are normalized to AS2 (W3C standard, JSON-LD). Chosen because:

- Covers every Instagram field without data loss (caption, carousel, location, tagged users, alt text, engagement counts)
- Battle-tested by Mastodon and Pixelfed (millions of objects daily)
- Future-proof: data is already in the right format for federation
- Plain JSON, no special libraries needed
- Extensible via JSON-LD contexts for platform-specific metadata

### Example Post (AS2)

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "id": "https://www.instagram.com/p/BxK3j2hA1/",
  "url": "https://www.instagram.com/p/BxK3j2hA1/",
  "published": "2024-03-15T14:30:00.000Z",
  "attributedTo": {
    "type": "Person",
    "name": "username1",
    "url": "https://www.instagram.com/username1/"
  },
  "content": "Amazing sunset at the beach!",
  "attachment": [
    {"type": "Image", "mediaType": "image/jpeg", "url": "1.jpg", "name": "Alt text"},
    {"type": "Image", "mediaType": "image/jpeg", "url": "2.jpg"},
    {"type": "Video", "mediaType": "video/mp4", "url": "3.mp4"}
  ],
  "location": {
    "type": "Place",
    "name": "Santa Monica Beach"
  },
  "tag": [
    {"type": "Mention", "href": "https://www.instagram.com/friend1/", "name": "@friend1"}
  ],
  "likes": {"type": "Collection", "totalItems": 42},
  "replies": {"type": "Collection", "totalItems": 3},
  "generator": {"type": "Application", "name": "Instagram"}
}
```

- `generator` identifies the source platform
- Media `url` values are relative paths to the sibling media directory
- `id` is the canonical URL from the platform

### Raw Source

Each post also has a `.raw.json` file containing the unmodified platform API response.

## Directory Layout

```
postkeeper/
  config.json
  plugins/
    instagram/
      index.js
      ...
  archive/
    instagram/
      state.json
      posts/
        username/
          2024-03-15-BxK3j2hA1.as2.json
          2024-03-15-BxK3j2hA1.raw.json
          2024-03-15-BxK3j2hA1/
            1.jpg
            2.jpg
            3.mp4
```

- `archive/` namespaced by plugin name
- State is per-plugin, opaque to core
- Two JSON files per post: `.as2.json` (canonical) and `.raw.json` (platform-specific)

## Configuration

```json
{
  "archive_dir": "./archive",
  "plugins": {
    "instagram": {
      "profiles": ["username1", "username2"],
      "profile_dir": "./.browser-profile"
    }
  }
}
```

Top-level settings plus per-plugin config sections. Each plugin defines its own config shape.

## Constraints

- Local-first: no server, no cloud, no accounts. Just files on disk.
- Plugins are local JS files in `plugins/`, not published to npm.
- Music data not available on Instagram web (accepted limitation).
- Platform frontend changes could break plugins; each plugin is responsible for its own resilience.
