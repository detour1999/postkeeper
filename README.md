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

## Setup

```bash
npm install
npx playwright install chromium
```

## Quick Start

```bash
postkeeper init instagram    # first-time browser login
postkeeper run               # run all configured plugins
postkeeper run instagram     # run a single plugin
postkeeper status            # check auth/connectivity
postkeeper list              # show installed plugins
```

## Configuration

Edit `config.json` in the project root:

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

- `archive_dir` -- where archived posts and media are written.
- `plugins` -- per-plugin configuration. Each key matches a plugin's `name`.

## Output Format

```
archive/
  instagram/
    state.json
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
- `profile_dir` -- path to the Playwright browser profile directory.

**How it works:**

1. `postkeeper init instagram` opens a real Chromium browser window. Log in manually, then close the window. The session is persisted to `profile_dir`.
2. `postkeeper run instagram` launches a headless browser, navigates to each profile, and intercepts Instagram's internal GraphQL API responses to extract structured post data.
3. Pagination is driven by scrolling the profile page. On the first run it scrolls through the full history; subsequent runs stop when reaching the last seen post timestamp.
4. For each new post, the plugin fetches full details (including all carousel items), downloads media, and returns an AS2 object with raw data for storage.

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

## Writing Plugins

Plugins live in the `plugins/` directory. Each plugin is a directory with an `index.js` that default-exports an object implementing the plugin interface:

```js
export default {
  name: "my-plugin",
  description: "Short description of what it archives",

  // First-time setup (e.g. browser login, OAuth flow).
  async init(config) { /* ... */ },

  // Check if the plugin can connect/authenticate. Return { ok, message }.
  async status(config) { /* ... */ },

  // Fetch new posts. Return { posts, state }.
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
- `context.state` -- previous plugin state (for tracking last-seen timestamps).
- `context.tmpDir` -- temporary directory for downloading media before it is moved to the archive.
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

## Limitations

- Instagram requires a real browser session; there are no API keys. Sessions may expire over time -- re-run `postkeeper init instagram` if polling fails.
- Music metadata is not available on the Instagram web interface.
- Platform frontend or API changes could break plugin extractors at any time.

## Tests

```bash
npm test
```
