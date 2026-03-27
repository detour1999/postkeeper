# Plugin Roadmap

Planned plugins for future development, roughly ordered by implementation difficulty.

## Done

### Google Photos

Archive photos and albums from Google Photos.

- **Status:** Implemented
- **Approach:** Authenticated Playwright scraping with Google Chrome
- **Data:** Photos, videos, metadata (date, location, EXIF, people tags)
- **Notes:** Uses real Chrome browser sessions. Progress is checkpointed; incremental runs only fetch new items.

## Easy

### Bluesky

Archive posts from Bluesky/AT Protocol accounts.

- **Approach:** AT Protocol API (public, no auth needed for public posts)
- **Data:** Posts, reposts, likes, media
- **Notes:** Open protocol with well-documented API. Straightforward to implement.

### GitHub

Archive GitHub activity (repos, stars, contributions).

- **Approach:** REST/GraphQL API with personal access token
- **Data:** Repositories, stars, contributions, issues, PRs
- **Notes:** Mature API with good documentation.

### Plex

Archive watch history from a local Plex server.

- **Approach:** Local HTTP API (no external auth needed)
- **Data:** Watch history, ratings
- **Notes:** Plex exposes a local API on the same machine. Easy to query.

## Medium

### Withings

Archive health data from Withings devices (scales, watches, blood pressure monitors).

- **Approach:** OAuth 2.0 API
- **Data:** Weight, body composition, blood pressure, sleep, activity
- **Notes:** Well-documented API, requires OAuth app registration.

### Google Maps

Archive location history and saved places.

- **Approach:** Google Takeout import and/or authenticated Playwright scraping
- **Data:** Location history, saved places, reviews, contributions
- **Notes:** Takeout provides bulk export; scraping covers ongoing updates.

### Google Health

Archive health and fitness data from Google Fit / Health Connect.

- **Approach:** Google Takeout import and/or authenticated Playwright scraping
- **Data:** Steps, heart rate, workouts, sleep
- **Notes:** Similar approach to Google Maps — Takeout for bulk, scraping for incremental.

## Hard

### Pandora

Archive listening history from Pandora.

- **Approach:** Scraping or data export request
- **Data:** Listening history, thumbs up/down, stations
- **Notes:** No public API. May require scraping or GDPR/CCPA data export requests. Likely fragile.
