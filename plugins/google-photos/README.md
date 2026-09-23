# Google Photos Plugin

Archives photos and videos from your Google Photos library using a real Chrome browser session.

## Setup

1. Make sure Google Chrome is installed. Google blocks Playwright's bundled Chromium from logging in, so this plugin uses Chrome instead:
   ```bash
   npx playwright install chrome
   ```

2. Initialize the plugin (opens Chrome for login):
   ```bash
   postkeeper init google-photos
   ```

3. Log in to your Google account in the browser window that opens.

4. Close the browser when done — your session is saved.

5. Add the plugin to your config:
   ```json
   {
     "plugins": {
       "google-photos": {}
     }
   }
   ```

6. Archive your library:
   ```bash
   postkeeper run google-photos
   ```

## Config

No options. The account name is detected automatically from the logged-in session.

## What Gets Archived

For each photo or video:
- Original media file
- Date taken
- Description
- Location (name and coordinates, if available)
- Camera EXIF details
- People tags

## Limitations

- **Requires a real browser session.** Sessions can expire and require re-login via `postkeeper init google-photos`.
- **Slow on large libraries.** The plugin visits each item's detail page with a polite delay between items. The first run over a large library can take a long time.
- **Resumable.** Progress is checkpointed to disk, so an interrupted run picks up where it left off. Later runs stop scrolling once they reach already-archived items.
- **Albums are not archived.** Only items in the main library are captured.
