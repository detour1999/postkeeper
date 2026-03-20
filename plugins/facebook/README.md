# Facebook Plugin

Archives your own Facebook posts using a real browser session to intercept GraphQL API responses.

## Setup

1. Initialize the plugin (opens a browser for login):
   ```bash
   postkeeper init facebook
   ```

2. Log in to Facebook in the browser window that opens.

3. Close the browser when done — your session is saved.

4. Add your profile URL to your config:
   ```json
   {
     "plugins": {
       "facebook": {
         "profiles": ["https://www.facebook.com/yourusername"]
       }
     }
   }
   ```

5. Archive your posts:
   ```bash
   postkeeper run facebook
   ```

## Config

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `profiles` | yes | `[]` | Array of Facebook profile URLs to archive |

## What Gets Archived

For each post:
- Post text
- Photos and videos (including multi-photo posts)
- Shared links (URL and title)
- Check-in locations
- Reaction and comment counts
- Published timestamp
- Permalink URL

## Limitations

- **Only your own posts.** Wall posts from other people on your timeline are filtered out.
- **Requires a real browser session.** Uses Playwright with a persistent Chromium profile. Sessions expire and need re-login via `postkeeper init facebook`.
- **Rate limiting.** Adaptive delays between requests. Large backlogs (thousands of posts) take a while.
- **Old posts may have missing media.** Some very old posts have empty media URLs that Facebook no longer serves. These are skipped gracefully.
- **3-strike rule.** 3 consecutive post failures pauses that profile.
