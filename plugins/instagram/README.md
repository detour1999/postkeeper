# Instagram Plugin

Archives your Instagram posts using a real browser session to intercept GraphQL API responses.

## Setup

1. Initialize the plugin (opens a browser for login):
   ```bash
   postkeeper init instagram
   ```

2. Log in to Instagram in the browser window that opens.

3. Close the browser when done — your session is saved.

4. Add profiles to your config:
   ```json
   {
     "plugins": {
       "instagram": {
         "profiles": ["yourusername"]
       }
     }
   }
   ```

5. Archive your posts:
   ```bash
   postkeeper run instagram
   ```

## Config

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `profiles` | yes | `[]` | Array of Instagram usernames to archive |

## What Gets Archived

For each post:
- Caption text
- All media (images and videos, including carousels)
- Alt text (accessibility captions)
- Tagged users
- Location (if tagged)
- Likes and comment counts
- Published timestamp

## Limitations

- **Requires a real browser session.** The plugin uses Playwright with a persistent Chromium profile. Sessions can expire and require re-login via `postkeeper init instagram`.
- **Rate limiting.** The plugin uses adaptive delays between requests to avoid triggering Instagram's rate limits. Large archives take time.
- **No stories or reels.** Only feed posts are archived.
- **3-strike rule.** If 3 consecutive posts fail to download, the plugin pauses that profile to avoid hammering a broken session.
