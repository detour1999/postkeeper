# Facebook Plugin Design

## Goal

A live Facebook archiver plugin using Playwright, mirroring the Instagram plugin's approach. Archives your own posts (and business page posts) by intercepting GraphQL responses from Facebook's web app.

## Architecture

Same structure as the Instagram plugin:

```
plugins/facebook/
  index.js       # plugin interface (init, status, run, shutdown)
  extractor.js   # Playwright GraphQL interception + post parsing
  downloader.js  # media downloading
  as2.js         # Facebook post → AS2 conversion
  package.json   # playwright dependency
```

## Config

```json
{
  "plugins": {
    "facebook": {
      "profiles": [
        "https://www.facebook.com/dylanr",
        "https://www.facebook.com/SomeBusinessPage"
      ]
    }
  }
}
```

Profiles is a list of Facebook profile/page URLs to archive.

## Auth

Persistent browser profile at `~/.local/share/postkeeper/facebook/browser-profile/`. `postkeeper init facebook` opens a browser for manual login, session is saved.

## Data Flow

1. **Init**: Open browser → user logs into Facebook → session saved
2. **Run**: For each profile URL:
   - Navigate to the profile's posts page
   - Intercept GraphQL responses as the page loads and scrolls
   - Parse post nodes from response JSON
   - Filter against `context.latestByAuthor[profileName]` to skip archived posts
   - Scroll backwards until hitting already-archived posts or end of timeline
   - For each new post: download media to `context.tmpDir`
   - Convert to AS2 and return `{ posts: [...] }`
3. **Processing order**: Collected posts sorted oldest-first so interruptions leave a clean resume point
4. **Resilience**: Per-post try/catch, 3 retries with exponential backoff, circuit breaker after 3 consecutive failures

## Content Types

All post types: text, photos, videos, shared links, check-ins, life events, etc.

## AS2 Mapping

| Facebook field | AS2 field |
|---|---|
| Post text | `content` |
| Timestamp | `published` |
| Profile name | `attributedTo.name` |
| Photos/videos | `attachment[]` (Image/Video) |
| Shared links | `attachment[]` (Link with url + name) |
| Location/check-in | `location` (Place) |
| Reactions count | `likes.totalItems` |
| Comments count | `replies.totalItems` |
| Post type | `type` = "Note" |
| Post permalink | `id` and `url` |

## Key Exploration

Facebook's GraphQL response format needs to be discovered by intercepting actual responses during development. The Instagram plugin intercepts responses matching `/graphql/query` and `/api/graphql` — Facebook likely uses similar endpoints but with different payload shapes.

## Reuse from Instagram

- Same Playwright persistent context pattern for auth
- Same retry/backoff/circuit-breaker logic
- Same media download approach (fetch to tmpDir, return file mappings)
- Downloader can be copied/adapted from Instagram's
