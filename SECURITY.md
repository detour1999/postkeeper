# Security Policy

## Reporting a Vulnerability

Please **do not** open a public issue for security problems.

Report vulnerabilities privately through GitHub's [private vulnerability reporting](https://github.com/detour1999/postkeeper/security/advisories/new). Include steps to reproduce and the version or commit you tested against.

This is a personal project maintained on a best-effort basis. You can expect an acknowledgement within a week or two.

## Scope

Postkeeper runs entirely on your own machine. The most sensitive things it handles are:

- **Browser sessions.** Plugins that log in through a browser (Instagram, Facebook, Google Photos) keep a persistent browser profile under `~/.local/share/postkeeper/<plugin>/`. Anyone who can read that directory can act as your logged-in accounts.
- **Archived data.** Posts, photos, and metadata are written unencrypted to `~/.local/share/postkeeper/archive/`.
- **Configuration.** `~/.config/postkeeper/config.json` may contain account identifiers.

Issues of particular interest:

- Session data or credentials leaking outside the data directory (logs, archive output, temp files)
- Path traversal when writing archive files or media
- Unsafe handling of untrusted content from feeds, exports, or platform responses
