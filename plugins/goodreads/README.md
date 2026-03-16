# Goodreads Plugin

Archives your book reading activity from Goodreads using public RSS feeds.

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

3. Verify access:
   ```bash
   postkeeper init goodreads
   ```

4. Archive your books:
   ```bash
   postkeeper run goodreads
   ```

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
- **Public shelves only.** RSS feeds are public — no authentication is needed, but private shelves are not accessible.
- **"Started" date is approximate.** The start date is derived from when the book was added to the RSS feed, which closely correlates with when you shelved it but isn't exact.
