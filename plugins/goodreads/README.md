# Goodreads Plugin

Archives your book reading activity from Goodreads shelf RSS feeds.

Goodreads requires a logged-in session for these feeds, so this plugin keeps a
browser session the way the Instagram, Facebook, and Google Photos plugins do.

## Setup

1. Find your Goodreads user ID:
   - Go to [goodreads.com](https://www.goodreads.com) and sign in
   - Click "My Books" in the navigation
   - Look at the URL — it will be something like `goodreads.com/review/list/12345678`
   - Your user ID is the number (`12345678`)

2. Add to your config:
   ```json
   {
     "plugins": {
       "goodreads": {
         "user_id": "12345678"
       }
     }
   }
   ```

3. Log in:
   ```bash
   postkeeper init goodreads
   ```
   This opens a real Chromium window. Log in to Goodreads, then close the
   window — the session is persisted to the plugin's data directory. The command
   then fetches each configured shelf and reports how many books it can see.

4. Archive your books:
   ```bash
   postkeeper run goodreads
   ```

## Handing Over a Session

If an agent is driving postkeeper and can't use the browser window `init` opens,
it can log in with its own browser and pass the cookies over:

```bash
postkeeper session set goodreads < cookies.json
postkeeper status goodreads          # confirms the session gets a real feed
```

See the main README's "Agent-Driven Login" section for the accepted formats.

## Config

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `user_id` | yes | — | Your Goodreads numeric user ID |
| `shelves` | no | `["read", "currently-reading"]` | Which shelves to archive |

## What Gets Archived

For each book:
- Title, author, ISBN
- Your rating (1-5 stars) and review
- Community average rating
- Publication year
- Cover image (largest available)
- Shelves the book is on
- When you started reading (date added to shelf)
- When you finished reading (if marked as read)

## Limitations

- **~200 books per shelf.** Goodreads RSS feeds are capped at approximately 200 items per shelf. Books beyond this limit are not available via RSS. Run the archiver periodically to capture books before they roll off.
- **Login required.** Goodreads serves its sign-in page for unauthenticated shelf
  feed requests, with HTTP 200 rather than a 401. The plugin treats a response
  that isn't a feed as an error and tells you to re-run `init`, so an expired
  session reads as a failure instead of an empty shelf.
- **"Started" date is approximate.** The start date is derived from when the book was added to the RSS feed, which closely correlates with when you shelved it but isn't exact.
