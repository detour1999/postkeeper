# Goodreads Plugin Design

## Overview

A Goodreads plugin for Postkeeper that archives book reading activity using public RSS feeds. No authentication or browser automation required — Goodreads exposes shelf data via RSS at `https://www.goodreads.com/review/list_rss/<user_id>?shelf=<shelf>`.

## Config

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

- `user_id` — required, Goodreads numeric user ID
- `shelves` — optional, defaults to `["read", "currently-reading"]`

## Data Model

Each book becomes a single archive entry. Books appearing on multiple shelves are deduplicated by `book_id`, merging shelf lists and keeping the earliest date.

### RSS Fields → Internal Book Object

| RSS Field | Book Field | Notes |
|-----------|-----------|-------|
| `book_id` | `bookId` | Unique identifier |
| `title` | `title` | Book title |
| `author_name` | `author` | Author name |
| `user_rating` | `rating` | 1-5 stars, 0 = unrated |
| `user_read_at` | `finished` | When marked as read (optional, null if unfinished) |
| `pubDate` | `started` | Earliest appearance across shelves (proxy for start date) |
| `book_image_url` | `cover` | Book cover image URL (upsized to largest available) |
| `isbn` | `isbn` | For external lookups |
| `book_published` | `yearPublished` | Publication year |
| `user_review` | `review` | User's review text (HTML) |
| `user_shelves` | `shelves` | List of shelf names |
| `average_rating` | `averageRating` | Community rating |
| `link` | `permalinkUrl` | Goodreads book page URL |

### Date Strategy

- **`started`**: Earliest `pubDate` seen across all shelves. This is the primary sort date — it represents when the book first appeared in the user's activity.
- **`finished`**: `user_read_at` if present. Null for books still being read or never marked as finished.
- **AS2 `published`**: Uses `started` so books sort by when the user picked them up.

### Deduplication

When the same `book_id` appears on multiple shelves:
1. Keep the earliest `pubDate` as `started`
2. Keep `user_read_at` from whichever entry has it
3. Merge shelf lists

## AS2 Output

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "id": "goodreads:book:12345",
  "url": "https://www.goodreads.com/book/show/12345",
  "published": "2024-03-15T00:00:00.000Z",
  "content": "★★★★★ - The Left Hand of Darkness by Ursula K. Le Guin",
  "attachment": [{ "type": "Image", "mediaType": "image/jpeg", "url": "cover.jpg" }],
  "generator": { "type": "Application", "name": "Goodreads" },
  "ext:book": {
    "title": "The Left Hand of Darkness",
    "author": "Ursula K. Le Guin",
    "isbn": "0441478123",
    "rating": 5,
    "averageRating": "4.18",
    "yearPublished": "1969",
    "review": "...",
    "shelves": ["read", "sci-fi"],
    "started": "2024-03-15T00:00:00.000Z",
    "finished": "2024-04-01T00:00:00.000Z"
  }
}
```

The `content` field is a human-readable summary (star rating + title + author) so the post makes sense in any AS2 viewer. The `ext:book` object holds structured book metadata.

## File Structure

```
plugins/goodreads/
  index.js          — plugin entry (init, status, run)
  fetcher.js        — RSS fetch + XML parsing
  extractor.js      — transform RSS items → book objects, deduplicate across shelves
  as2.js            — convert book objects → AS2 format
  README.md         — plugin docs (config, setup, limitations)
  package.json      — depends on fast-xml-parser (same as RSS plugin)
```

## XML Parsing

Uses `fast-xml-parser` (same dependency as the existing RSS plugin). Goodreads RSS contains CDATA sections and HTML entities in reviews, so a real parser is necessary.

## Cover Images

Goodreads image URLs follow a pattern where size codes can be swapped for larger versions. The fetcher attempts to upsize URLs to get the largest available cover, falling back to whatever the RSS provides.

## Plugin Lifecycle

- **`init`**: Validates config has `user_id`, fetches a test RSS feed to confirm it's accessible
- **`status`**: Checks if `user_id` is set in config
- **`run`**: Fetches each shelf's RSS → parses XML → deduplicates books → downloads covers → converts to AS2 → returns posts array

## Known Limitations

- RSS feeds are capped at ~200 items per shelf. Historical data beyond that limit is not available via RSS.
- No authentication means only public shelves are accessible.
- `pubDate` is a proxy for "started reading" — it's actually when the item was added to the feed, which correlates closely but isn't exact.

## Per-Plugin README Convention

This plugin introduces a per-plugin `README.md` convention. Each plugin README documents:
- What it does (one-liner)
- Config fields and setup instructions
- How to find required IDs (e.g., Goodreads user ID)
- Known limitations
- What data is archived

This convention supports a future plugin viewer page on the project website.
