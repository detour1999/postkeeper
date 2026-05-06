# Plugin State Discovery Design

**Goal:** Make `npm install -g github:detour1999/postkeeper` produce a clean `postkeeper list` and intelligible CLI output for plugins whose deps have not yet been installed via `postkeeper init`.

**Background:** Plugins follow a "fat plugins" architecture (see CONTRIBUTING.md): each plugin owns its `package.json` and platform-specific dependencies, installed lazily by `postkeeper init <name>`. After a fresh global install, plugin `node_modules` directories are empty, so `discoverPlugins` fails to import every plugin and surfaces `Skipping plugin "instagram": Cannot find package 'playwright'…` for each one. That output is noisy and doesn't tell the user what to do.

## Decisions

| Decision | Choice |
|----------|--------|
| Strategy | Distinguish "not yet installed" from "broken" in `discoverPlugins`; commands present each clearly. |
| `list` behavior for uninstalled | Include with `(not installed — run: postkeeper init <name>)` suffix. |
| Disk-cost behavior | Unchanged — deps still install on `init`. No postinstall hook. |
| Detection signal | `package.json` exists AND `node_modules` does not. |
| Broken plugins | Keep current `console.warn` behavior. |

## Architecture

`discoverPlugins(pluginsDir)` returns an array whose entries each have an explicit `state`:

| state | meaning | shape |
|---|---|---|
| `loaded` | import succeeded | full plugin object: `{ state: "loaded", name, run, status?, init, shutdown? }` |
| `uninstalled` | import failed AND `<dir>/package.json` exists AND `<dir>/node_modules` does not | stub: `{ state: "uninstalled", name }` |
| `broken` | not returned. Existing `console.warn` is preserved. | n/a |

The result is sorted by `name` so callers and tests don't depend on filesystem order.

## File Structure

```
src/core/plugins.js                # discoverPlugins gains state-tagged output
src/cli.js                         # list/status/run branch on state
tests/core/plugins.test.js         # new unit tests with fixture plugins
```

## Data Flow

```
postkeeper run instagram
  → discoverPlugins(PLUGINS_DIR)
    → [{state:"loaded", name:"goodreads", ...},
       {state:"uninstalled", name:"instagram"},
       ...]
  → CLI's run command:
     - if instagram is uninstalled, print friendly message + exit non-zero
     - else proceed to status check + runPlugin
```

## CLI Command Behavior

- **`list`** — show all plugins. Loaded rows look unchanged; uninstalled rows append `(not installed — run: postkeeper init <name>)`.
- **`status [plugin]`** — for an uninstalled plugin, print `<name>: not installed — run: postkeeper init <name>` and continue (matches the current "skip" behavior with a clearer message). With a specific plugin name that's uninstalled, exit non-zero.
- **`run [plugin]`** — same shape as `status`. With no argument, skip uninstalled plugins with a one-line message. With a name that's uninstalled, exit non-zero.
- **`init [plugin]`** — unchanged. Continues to run `npm install` in the plugin dir, then the plugin's interactive setup.

## Error Handling

- **Uninstalled:** never silent. Always shown with the exact `postkeeper init <name>` to fix it.
- **Broken (other import failures):** keep current `console.warn("Skipping plugin X: ...")`. Real bugs stay loud.
- **Plugin name not present at all (typo / not a directory):** existing `Plugin "<name>" not found` error path is preserved.

## Testing

Unit tests in `tests/core/plugins.test.js` against a temp fixture directory containing three plugin subdirs:

1. **working** — `index.js` exporting a valid plugin (no external deps). Expect `state: "loaded"`.
2. **uninstalled** — `package.json` declaring an external dep, `index.js` importing it, no `node_modules`. Expect `state: "uninstalled"` and no warning emitted.
3. **broken** — `index.js` with a syntax error or import that fails for a non-deps reason. Expect not present in output AND `console.warn` was called.

CLI command branches remain manually verified (matches existing convention; `src/cli.js` is excluded from coverage).

## Out of Scope

- Postinstall hook to install all plugin deps on `npm install -g`.
- Auto-installing plugin deps on first `run`.
- A separate `postkeeper install <plugin>` command.
- Rich diagnostics (which package is missing, version mismatches, etc.).
