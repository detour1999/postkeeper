# RSS Plugin

Archives posts from RSS and Atom feeds. No authentication needed.

## Setup

1. Add feeds to your config:
   ```json
   {
     "plugins": {
       "rss": {
         "feeds": [
           { "url": "https://example.com/feed.xml", "name": "Example Blog" },
           { "url": "https://another.com/atom.xml", "name": "Another Blog" }
         ]
       }
     }
   }
   ```

2. Verify access:
   ```bash
   postkeeper init rss
   ```

3. Archive posts:
   ```bash
   postkeeper run rss
   ```

## Config

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `feeds` | yes | `[]` | Array of feed objects |
| `feeds[].url` | yes | — | Feed URL (RSS 2.0 or Atom 1.0) |
| `feeds[].name` | no | feed URL | Display name for the feed |

## What Gets Archived

For each article:
- Title and URL
- Full content (or description if no full content)
- Author
- Published date
- Categories/tags
- Enclosures (audio, video, image attachments are downloaded)

## Limitations

- **Feed size limits.** Most feeds only expose the most recent items (typically 10-50). Run the archiver regularly to capture posts before they roll off.
- **No authentication.** Only public feeds are supported.
- **Deduplication.** Articles are deduplicated by URL first, then by author + published date for feeds without stable URLs.
