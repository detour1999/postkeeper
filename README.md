# postkeeper

A local-first personal social media archiver with plugin support.

Archives posts as [ActivityStreams 2.0](https://www.w3.org/TR/activitystreams-core/) JSON with raw platform data preserved alongside. Media files (images, videos) are downloaded and stored locally.

## Install

```bash
npm install -g github:detour1999/postkeeper
npx playwright install chromium
```

Or clone and link locally:

```bash
git clone https://github.com/detour1999/postkeeper.git
cd postkeeper
npm install
npx playwright install chromium
npm link
```

Plugin dependencies are installed automatically during `postkeeper init`.

## Quick Start

```bash
postkeeper init instagram    # creates ~/.config/postkeeper/, first-time browser login
postkeeper run               # run all configured plugins
postkeeper run instagram     # run a single plugin
postkeeper status            # check auth/connectivity
postkeeper list              # show installed plugins
```

Archive data is stored at `~/.local/share/postkeeper/archive/`.

## Configuration

Config is stored at `~/.config/postkeeper/config.json` (created by `postkeeper init`).

Override directories with environment variables:
- `POSTKEEPER_CONFIG_DIR` -- config directory (default: `~/.config/postkeeper/`)
- `POSTKEEPER_DATA_DIR` -- data directory (default: `~/.local/share/postkeeper/`)

```json
{
  "plugins": {
    "instagram": {
      "profiles": ["username1", "username2"]
    }
  }
}
```

- `plugins` -- per-plugin configuration. Each key matches a plugin's `name`.

## Output Format

```
archive/
  instagram/
    posts/
      username1/
        2024-03-15-BxK3j2hA1.as2.json
        2024-03-15-BxK3j2hA1.raw.json
        2024-03-15-BxK3j2hA1/
          1.jpg
          2.mp4
      username2/
        ...
```

- `.as2.json` -- ActivityStreams 2.0 representation of the post.
- `.raw.json` -- unmodified platform data as returned by the plugin.
- Media directory -- downloaded images and videos, named by index.

### AS2 Example

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
  "content": "The full caption text...",
  "attachment": [
    { "type": "Image", "mediaType": "image/jpeg", "url": "1.jpg" },
    { "type": "Video", "mediaType": "video/mp4", "url": "2.mp4" }
  ],
  "location": { "type": "Place", "name": "Portland, OR" },
  "generator": { "type": "Application", "name": "Instagram" }
}
```

## Instagram Plugin

The built-in Instagram plugin archives posts from public or followed profiles.

**Configuration:**

- `profiles` -- list of Instagram usernames to poll.

**How it works:**

1. `postkeeper init instagram` opens a real Chromium browser window. Log in manually, then close the window. The browser session is persisted to the plugin's data directory.
2. `postkeeper run instagram` launches a headless browser, navigates to each profile, and intercepts Instagram's internal GraphQL API responses to extract structured post data.
3. Pagination is driven by scrolling the profile page. On the first run it scrolls through the full history; subsequent runs stop when reaching the last seen post timestamp.
4. For each new post, the plugin fetches full details (including all carousel items), downloads media, and returns an AS2 object with raw data for storage.

## Facebook Plugin

Archives your own Facebook posts using a real browser session.

**Configuration:**

```json
{
  "plugins": {
    "facebook": {
      "profiles": [
        "https://www.facebook.com/yourusername",
        "https://www.facebook.com/YourBusinessPage"
      ]
    }
  }
}
```

- `profiles` -- list of Facebook profile/page URLs to archive.

**How it works:**

1. `postkeeper init facebook` opens a real Chromium browser window. Log in manually, then close the window. The browser session is persisted to the plugin's data directory.
2. `postkeeper run facebook` launches a headless browser, navigates to each profile URL, and intercepts Facebook's internal GraphQL API responses to extract structured post data.
3. On the first run it scrolls through the full history; subsequent runs stop when reaching the last archived post timestamp.
4. Archives all post types: text, photos, videos, shared links, check-ins, and life events.

## RSS/Atom Plugin

Archives posts from RSS and Atom feeds as AS2 Articles.

**Configuration:**

```json
{
  "plugins": {
    "rss": {
      "feeds": [
        { "url": "https://example.com/feed.xml", "name": "Example Blog" }
      ]
    }
  }
}
```

- `feeds` -- array of feeds to poll. Each has a `url` and optional `name`.

**How it works:** Fetches each feed, parses entries, converts them to AS2 Articles, and downloads any enclosures (podcasts, images). Tracks last-seen entry IDs to avoid re-archiving.

## Goodreads Plugin

Archives your books, ratings, and reviews from Goodreads using public shelf RSS feeds.

**Configuration:**

```json
{
  "plugins": {
    "goodreads": {
      "user_id": "12345678",
      "shelves": ["read", "currently-reading"]
    }
  }
}
```

- `user_id` -- your numeric Goodreads user ID (the number in `goodreads.com/review/list/<id>`).
- `shelves` -- optional list of shelves to archive. Defaults to `read` and `currently-reading`.

**How it works:** Fetches the RSS feed for each shelf, converts each book to AS2, and downloads the cover image. No login is needed, but only public shelves are available and Goodreads caps each feed at roughly 200 books. See [plugins/goodreads/README.md](plugins/goodreads/README.md) for details.

## Meta Archive Plugin

Imports posts from Meta (Facebook/Instagram) data exports.

**Configuration:**

```json
{
  "plugins": {
    "meta-archive": {
      "sources": [
        { "path": "~/Downloads/instagram-export", "platform": "instagram" },
        { "path": "~/Downloads/facebook-export", "platform": "facebook" }
      ]
    }
  }
}
```

- `sources` -- array of export directories. Each has a `path` and `platform` (`instagram` or `facebook`).

**How it works:** Reads Meta's JSON and HTML export formats, converts posts to AS2, and copies media into the archive. Handles Meta's UTF-8 encoding bug in JSON exports automatically.

## Google Photos Plugin

Archives photos and videos from your Google Photos library.

**Configuration:**

```json
{
  "plugins": {
    "google-photos": {}
  }
}
```

No configuration needed beyond plugin presence. The account name is detected automatically from the logged-in session.

**How it works:**

1. `postkeeper init google-photos` opens a real Chrome browser window. Log in to your Google account, then close the window. The browser session is persisted to the plugin's data directory.
2. `postkeeper run google-photos` launches a headless browser, scrolls through your photo library to discover items, visits each item's detail page for full metadata (date, location, camera EXIF, people tags), downloads the original media, and returns AS2 Notes.
3. Progress is checkpointed to disk. If a run is interrupted, the next run picks up where it left off.
4. Subsequent runs stop scrolling when they reach already-archived items, so only new photos are processed.

**Note:** Google blocks Playwright's default Chromium from login. This plugin requires Google Chrome to be installed (`npx playwright install chrome` if needed).

## Writing Plugins

Plugins live in the `plugins/` directory. Each plugin is a directory with an `index.js` that default-exports an object implementing the plugin interface:

```js
export default {
  name: "my-plugin",
  description: "Short description of what it archives",

  // First-time setup (e.g. browser login, OAuth flow).
  // context provides: context.dataDir, context.log(msg)
  async init(config, context) { /* ... */ },

  // Check if the plugin can connect/authenticate. Return { ok, message }.
  // context provides: context.dataDir, context.log(msg)
  async status(config, context) { /* ... */ },

  // Fetch new posts. Return { posts }.
  // Each post in the array: { as2, raw, media }
  //   as2   -- complete ActivityStreams 2.0 object
  //   raw   -- original platform data (saved as .raw.json)
  //   media -- array of { relativePath, tmpPath } for downloaded files
  async run(config, context) { /* ... */ },

  // Cleanup (e.g. close browser). Optional.
  async shutdown() { /* ... */ },
};
```

The `context` object passed to `run` provides:
- `context.archivedIds` -- Set of AS2 IDs already in the archive.
- `context.latestByAuthor` -- `{ authorName: latestPublishedTimestamp }` derived from the archive.
- `context.tmpDir` -- temporary directory for downloading media before it is moved to the archive.
- `context.dataDir` -- plugin-specific persistent data directory.
- `context.log(msg)` -- log a message under the plugin's name.

Plugins can have their own `package.json` for dependencies. Run `postkeeper init <name>` to install them.

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
    <string>run</string>
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
0 6 * * * cd /path/to/postkeeper && node src/cli.js run >> poll.log 2>&1
```

This runs daily at 6 AM. Adjust the schedule as needed.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for planned plugins (Bluesky, GitHub, Plex, and more).

## Limitations

- Instagram requires a real browser session; there are no API keys. Sessions may expire over time -- re-run `postkeeper init instagram` if polling fails.
- Music metadata is not available on the Instagram web interface.
- Platform frontend or API changes could break plugin extractors at any time.

## Responsible Use

Postkeeper is for archiving **your own** content. The browser-based plugins (Instagram, Facebook, Google Photos) automate a logged-in session of your account, which may conflict with a platform's terms of service. You are responsible for how you use this tool and for complying with the terms of each platform you archive from. Do not use it to collect other people's content.

Browser sessions and archived data are stored unencrypted under `~/.local/share/postkeeper/`. Treat that directory like a password store: anyone with access to it can act as your logged-in accounts.

## Tests

```bash
npm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
