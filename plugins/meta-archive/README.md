# Meta Archive Plugin

Imports posts from Meta (Facebook and Instagram) data export packages. Use this to archive historical posts from your downloaded data exports.

## Setup

1. Request your data from Meta:
   - **Instagram:** Settings → Privacy Center → Download your information
   - **Facebook:** Settings → Your Facebook Information → Download Your Information

2. Download the export (ZIP file or extracted directory).

3. Add sources to your config:
   ```json
   {
     "plugins": {
       "meta-archive": {
         "sources": [
           { "path": "~/Downloads/instagram-export.zip", "platform": "instagram", "username": "yourusername" },
           { "path": "~/Downloads/facebook-export/", "platform": "facebook", "username": "yourname" }
         ]
       }
     }
   }
   ```

4. Verify sources:
   ```bash
   postkeeper init meta-archive
   ```

5. Import posts:
   ```bash
   postkeeper run meta-archive
   ```

## Config

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `sources` | yes | `[]` | Array of source objects |
| `sources[].path` | yes | — | Path to ZIP file or extracted directory (supports `~/`) |
| `sources[].platform` | yes | — | `"instagram"` or `"facebook"` |
| `sources[].username` | no | — | Author name for posts |

## What Gets Archived

For each post:
- Post text / caption
- Media (photos and videos from the export)
- Published timestamp
- Author attribution

## Supported Export Formats

- **Instagram JSON:** `your_instagram_activity/media/posts_1.json`
- **Instagram HTML:** Falls back to HTML parsing if JSON is unavailable
- **Facebook JSON:** `your_facebook_activity/posts/your_posts_*.json`
- Both ZIP archives and extracted directories are supported

## Limitations

- **One-time import.** This plugin is designed for importing historical data from Meta exports. For ongoing archiving, use the Instagram or Facebook plugins.
- **Meta's encoding quirk.** Meta exports double-encode UTF-8 characters. The plugin handles this automatically.
- **Media must be included in the export.** If you downloaded your data without media, only text will be archived.
- **Deduplication.** Posts already in the archive (by ID) are skipped on subsequent runs.
