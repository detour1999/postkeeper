# InstaPost

Poll Instagram profiles and download posts (media + metadata) locally.

Uses Playwright to automate a real browser session, intercepting Instagram's internal GraphQL API to get structured post data. No official API credentials needed.

## Setup

```bash
npm install
npx playwright install chromium
```

## Usage

### 1. Log in to Instagram

```bash
node src/cli.js login
```

A browser window opens. Log in to Instagram manually, then close the browser. Your session is saved to `.browser-profile/` for future headless runs.

### 2. Configure profiles

Edit `config.json` and add the Instagram usernames you want to poll:

```json
{
  "profiles": ["username1", "username2"],
  "output_dir": "./output",
  "profile_dir": "./.browser-profile"
}
```

### 3. Poll for posts

```bash
node src/cli.js poll
```

On the first run, this scrolls through the entire post history for each profile. Subsequent runs only fetch posts newer than the last seen timestamp.

## Output

```
output/
  state.json                          # tracks last seen post per profile
  posts/
    username1/
      2024-03-15-BxK3j2hA1.json      # post metadata
      2024-03-15-BxK3j2hA1/          # media files
        1.jpg
        2.jpg
        3.mp4
    username2/
      ...
```

### Post JSON structure

```json
{
  "shortcode": "BxK3j2hA1",
  "url": "https://www.instagram.com/p/BxK3j2hA1/",
  "id": "123456789",
  "username": "username1",
  "timestamp": "2024-03-15T14:30:00.000Z",
  "caption": "The full caption text...",
  "location": { "name": "Portland, OR", "id": "12345" },
  "tagged_users": ["friend1", "friend2"],
  "alt_text": "Photo description",
  "likes": 42,
  "comments": 3,
  "media_type": "carousel",
  "media": [
    { "type": "image", "url": "https://...", "file": "1.jpg" },
    { "type": "image", "url": "https://...", "file": "2.jpg" },
    { "type": "video", "url": "https://...", "file": "3.mp4" }
  ]
}
```

## How it works

1. **Authentication**: Playwright persistent browser context. Login once manually, reuse the session headlessly.
2. **Data extraction**: Navigates to each profile page and intercepts GraphQL API responses (not DOM scraping) to get structured post data.
3. **Pagination**: Scrolls down the profile page to trigger loading of older posts, stopping when it reaches posts already seen.
4. **Full post details**: For each new post, navigates to its permalink to get complete data including all carousel items.
5. **Rate limiting**: Random delays between requests (1-3s between posts, 2-5s between profiles).

## Limitations

- Requires a real Instagram login session (no API keys)
- Session may expire; re-run `login` if polling starts failing
- Music data is not available on web
- Instagram frontend changes could break GraphQL interception

## Tests

```bash
node --test tests/
```
