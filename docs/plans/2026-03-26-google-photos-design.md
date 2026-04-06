# Google Photos Plugin Design

**Goal:** Archive all photos and videos from a Google Photos account using the authed browser pattern.

**Architecture:** Same structure as Instagram/Facebook plugins — persistent Playwright browser profile for auth, headless runs with scroll-based discovery, detail page scraping for metadata, media download to tmpDir.

## Decisions

| Decision | Choice |
|----------|--------|
| Unit of archival | Individual photo/video = one AS2 Note |
| Discovery method | Scroll main photo grid at photos.google.com |
| Metadata extraction | Visit each item's detail page, scrape info panel |
| Initial backfill | Browser scrolling (no Takeout import) |
| Album support | Not in scope for v1 |
| Auto-generated labels | Not in scope (search-only feature, not exposed in DOM) |

## File Structure

```
plugins/google-photos/
  index.js         # Plugin interface: init, run, status, shutdown
  extractor.js     # scrollLibrary, fetchItemDetails, parseItem
  downloader.js    # downloadMedia
  as2.js           # toAS2
  package.json     # playwright dependency
```

## Data Flow

1. **init** — open interactive browser, user logs into Google account, session persists to `context.dataDir/browser-profile`
2. **run** — launch headless, scrape account name from page, scroll photo grid to discover item IDs, visit each item's detail page for full metadata, download original media, return AS2 Notes
3. **status** — headless check for login state (detect login page vs photo grid)

## Discovery: Scrolling the Photo Grid

Navigate to `https://photos.google.com` and scroll the main grid. Google Photos loads content in chronological chunks.

**Interception strategy:** Listen for network responses containing item data. If Google's internal API responses are too opaque (protobuf-like JSON arrays), fall back to DOM scraping — query the grid for item links matching `photos.google.com/photo/XXXXX`.

**Scroll loop:** Same pattern as Instagram/Facebook — scroll to bottom, wait for new content, track consecutive empty scrolls to detect end-of-library. Stop early on subsequent runs when we hit an item ID already in `context.archivedIds`.

**Checkpoint:** After each scroll batch, write discovered item IDs to `progress.json` so scroll progress survives crashes.

## Detail Page Extraction

For each discovered item ID, navigate to `https://photos.google.com/photo/ITEM_ID` and open the info panel.

**Metadata scraped from DOM:**
- Date/time/timezone taken
- Location (place name + GPS coordinates)
- Filename, format, size, resolution
- Camera model + EXIF (aperture, focal length, ISO)
- People/pets (face tags)
- Description/caption (if user-added)

**Download:** Original-quality media URL needs investigation during implementation — may need to intercept the download action network request rather than grab the display URL, since the web view may serve compressed versions.

## AS2 Output

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "type": "Note",
  "id": "google-photos:ITEM_ID",
  "url": "https://photos.google.com/photo/ITEM_ID",
  "published": "2024-03-15T14:30:00.000Z",
  "attributedTo": {
    "type": "Person",
    "name": "scraped-from-page",
    "url": "https://photos.google.com"
  },
  "content": "User caption if any",
  "attachment": [
    { "type": "Image", "mediaType": "image/jpeg", "url": "1.jpg" }
  ],
  "location": {
    "type": "Place",
    "name": "Portland, Oregon",
    "latitude": 45.5152,
    "longitude": -122.6784
  },
  "generator": { "type": "Application", "name": "Google Photos" },
  "tag": [
    { "type": "Person", "name": "Tagged Person" }
  ]
}
```

Raw data (`.raw.json`) preserves everything: EXIF, camera info, resolution, filename, people — all metadata that doesn't map cleanly to AS2.

## Resumability

`progress.json` in `context.dataDir`:
```json
{
  "discovered": ["id1", "id2", "id3"],
  "completed": ["id1", "id2"],
  "lastScrollPosition": "2024-03-15"
}
```

Items move from `discovered` to `completed` after successful detail extraction + media download. Next run skips `completed` items, resumes with remaining `discovered`, then scrolls for more.

## Error Handling

- **Rate limiting:** 1-2 second delay + jitter between detail page visits. Pause 60 seconds on CAPTCHA/rate limit, retry up to 3 times.
- **Download failures:** Skip after 3 retries, don't mark as completed — retried on next run.
- **Session expiry:** Detect login page during headless run, stop early, log error asking user to re-run `postkeeper init google-photos`.

## Config

```json
{
  "plugins": {
    "google-photos": {}
  }
}
```

No config needed beyond plugin presence. Account name is scraped from the logged-in page during each run. Init only does browser login.
