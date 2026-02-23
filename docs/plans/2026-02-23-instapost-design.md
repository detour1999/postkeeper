# InstaPost Design

## Purpose

Poll a set of Instagram profiles for new posts, download all media and metadata locally so it can be republished to a Hugo blog (or any other consumer).

## Architecture

Node.js CLI tool using Playwright for browser automation. Two commands:

- **`instapost login`** — Opens a headed Playwright browser with a persistent profile directory. User logs into Instagram manually. Session persists for future headless runs.
- **`instapost poll`** — Headless. Loads each configured profile, detects new posts since last run, downloads media + metadata, writes output files.

## Authentication Strategy

Playwright persistent browser context (`launchPersistentContext()`). First run or session expiry: user runs `login` command, logs in by hand in a real browser window. Subsequent `poll` runs reuse the saved profile directory headlessly.

This avoids cookie extraction complexity and keeps Meta's bot detection happy since the initial login is a real human interaction.

## Data Extraction

1. Navigate to each profile page.
2. Intercept Instagram's internal GraphQL API responses to get the post list with structured JSON (more reliable than DOM scraping).
3. For each new post, navigate to its permalink (`instagram.com/p/<shortcode>/`) to get full data including all carousel items (`edge_sidecar_to_children`).
4. Download all media files (images, videos).

### Data captured per post

- Shortcode (primary identifier)
- Canonical URL (`https://www.instagram.com/p/<shortcode>/`)
- Numeric ID (internal, secondary)
- Timestamp
- Caption text
- Media type (image, video, carousel)
- All media files (full carousel)
- Location
- Tagged users
- Alt text
- Like/comment counts

## Output Format

```
output/
  posts/
    username1/
      2026-02-23-BxK3j2hA1.json
      2026-02-23-BxK3j2hA1/
        1.jpg
        2.jpg
        3.mp4
    username2/
      ...
```

### Post JSON structure

```json
{
  "shortcode": "BxK3j2hA1",
  "url": "https://www.instagram.com/p/BxK3j2hA1/",
  "id": "123456789",
  "username": "username1",
  "timestamp": "2026-02-23T14:30:00Z",
  "caption": "The full caption text...",
  "location": { "name": "Portland, OR", "id": "12345" },
  "tagged_users": ["friend1", "friend2"],
  "alt_text": "Photo description",
  "likes": 42,
  "comments": 3,
  "media_type": "carousel",
  "media": [
    { "type": "image", "file": "1.jpg", "url": "https://..." },
    { "type": "image", "file": "2.jpg", "url": "https://..." },
    { "type": "video", "file": "3.mp4", "url": "https://..." }
  ]
}
```

## State Tracking

`state.json` at the output root tracks last seen post timestamp per username. Each poll only processes posts newer than the stored timestamp, then updates it.

## Configuration

`config.json` at project root:

```json
{
  "profiles": ["username1", "username2", "username3"],
  "output_dir": "./output",
  "profile_dir": "./.browser-profile"
}
```

## Scheduling

Designed to be run periodically via cron/launchd. Each run is idempotent — only fetches new posts since last seen timestamp.

## Constraints

- No official API for personal accounts; browser automation covers all account types uniformly.
- Music data not available on web — accepted limitation.
- Instagram frontend changes could break GraphQL interception; shortcodes and permalink navigation are the most stable surface.
