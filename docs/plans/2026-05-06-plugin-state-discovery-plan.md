# Plugin State Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `discoverPlugins` return state-tagged entries (`loaded` / `uninstalled`) so the CLI can produce clean, actionable output for plugins whose deps haven't been installed via `postkeeper init`.

**Architecture:** Extend `src/core/plugins.js` to detect `package.json`-without-`node_modules` and return a stub `{ state: "uninstalled", name }` instead of swallowing the import error. Loaded plugins gain `state: "loaded"`. Update the three CLI commands (`list`, `status`, `run`) to branch on the new field.

**Tech Stack:** Node.js ESM, `node:test`, `node:fs`. No new dependencies.

**Reference design:** `docs/plans/2026-05-06-plugin-state-discovery-design.md`

---

## Task 1: Tag loaded plugins with `state: "loaded"`

**Files:**
- Modify: `src/core/plugins.js:5-33`
- Test: `tests/core/plugins.test.js`

**Step 1: Write the failing test**

Add this test to the `discoverPlugins` describe block in `tests/core/plugins.test.js` (after the "discovers plugins…" test):

```js
test("tags loaded plugins with state: 'loaded'", async () => {
  const pluginDir = join(pluginsDir, "stateful-plugin");
  mkdirSync(pluginDir);
  writeFileSync(
    join(pluginDir, "index.js"),
    `export default {
      name: "stateful-plugin",
      async init() {},
      async run() { return { posts: [] }; },
    };`
  );

  const plugins = await discoverPlugins(pluginsDir);
  assert.strictEqual(plugins.length, 1);
  assert.strictEqual(plugins[0].state, "loaded");
  assert.strictEqual(plugins[0].name, "stateful-plugin");
  assert.strictEqual(typeof plugins[0].run, "function");
});
```

**Step 2: Run test, verify it fails**

```
node --test tests/core/plugins.test.js
```

Expected: 1 fail (`plugins[0].state` is `undefined`).

**Step 3: Implement**

In `src/core/plugins.js`, change the `plugins.push(plugin)` line to:

```js
plugins.push({ state: "loaded", ...plugin });
```

**Step 4: Run tests, verify all pass**

```
node --test tests/core/plugins.test.js
```

Expected: all pass (existing tests continue to work because `state` is purely additive).

**Step 5: Commit**

```bash
git add src/core/plugins.js tests/core/plugins.test.js
git commit -m "feat(core): tag loaded plugins with state: 'loaded'"
```

---

## Task 2: Detect and return "uninstalled" plugins

**Files:**
- Modify: `src/core/plugins.js`
- Test: `tests/core/plugins.test.js`

**Step 1: Write the failing tests**

Add to `tests/core/plugins.test.js`:

```js
test("returns 'uninstalled' state when package.json exists but node_modules does not", async () => {
  const pluginDir = join(pluginsDir, "needy-plugin");
  mkdirSync(pluginDir);
  writeFileSync(
    join(pluginDir, "package.json"),
    JSON.stringify({ name: "needy-plugin", dependencies: { "some-missing-pkg": "^1.0.0" } })
  );
  writeFileSync(
    join(pluginDir, "index.js"),
    `import "some-missing-pkg";\nexport default { name: "needy-plugin", async init() {}, async run() { return { posts: [] }; } };`
  );

  const warns = [];
  const origWarn = console.warn;
  console.warn = (msg) => warns.push(msg);
  try {
    const plugins = await discoverPlugins(pluginsDir);
    assert.strictEqual(plugins.length, 1);
    assert.strictEqual(plugins[0].state, "uninstalled");
    assert.strictEqual(plugins[0].name, "needy-plugin");
    assert.deepStrictEqual(warns, [], "no warning should be emitted for uninstalled plugins");
  } finally {
    console.warn = origWarn;
  }
});

test("warns and omits a plugin that fails for non-missing-deps reasons", async () => {
  const pluginDir = join(pluginsDir, "broken-plugin");
  mkdirSync(pluginDir);
  // No package.json, so detection won't say 'uninstalled'.
  writeFileSync(
    join(pluginDir, "index.js"),
    `this is not valid javascript`
  );

  const warns = [];
  const origWarn = console.warn;
  console.warn = (msg) => warns.push(msg);
  try {
    const plugins = await discoverPlugins(pluginsDir);
    assert.strictEqual(plugins.length, 0);
    assert.strictEqual(warns.length, 1);
    assert.match(warns[0], /broken-plugin/);
  } finally {
    console.warn = origWarn;
  }
});
```

**Step 2: Run, verify failure**

```
node --test tests/core/plugins.test.js
```

Expected: 2 new fails — first because `plugins.length === 0` (currently broken plugins are warned/skipped, not returned as uninstalled); second test should already pass (current behavior already warns), but if it doesn't, the new logic must preserve it.

**Step 3: Implement detection**

Replace the `catch (err)` block in `src/core/plugins.js` with:

```js
} catch (err) {
  const pkgJsonPath = join(pluginsDir, entry.name, "package.json");
  const nodeModulesPath = join(pluginsDir, entry.name, "node_modules");
  if (existsSync(pkgJsonPath) && !existsSync(nodeModulesPath)) {
    plugins.push({ state: "uninstalled", name: entry.name });
  } else {
    console.warn(`Skipping plugin "${entry.name}": ${err.message}`);
  }
}
```

**Step 4: Run, verify pass**

```
node --test tests/core/plugins.test.js
```

Expected: all pass.

**Step 5: Commit**

```bash
git add src/core/plugins.js tests/core/plugins.test.js
git commit -m "feat(core): detect uninstalled plugins (package.json without node_modules)"
```

---

## Task 3: Sort output by name

**Files:**
- Modify: `src/core/plugins.js` (add `.sort` before return)
- Test: `tests/core/plugins.test.js`

**Step 1: Write the failing test**

```js
test("returns plugins sorted by name", async () => {
  for (const name of ["zeta", "alpha", "mu"]) {
    const dir = join(pluginsDir, name);
    mkdirSync(dir);
    writeFileSync(
      join(dir, "index.js"),
      `export default { name: "${name}", async init() {}, async run() { return { posts: [] }; } };`
    );
  }

  const plugins = await discoverPlugins(pluginsDir);
  assert.deepStrictEqual(
    plugins.map((p) => p.name),
    ["alpha", "mu", "zeta"]
  );
});
```

**Step 2: Run, verify failure** (filesystem order will not be guaranteed alphabetical).

```
node --test tests/core/plugins.test.js
```

**Step 3: Implement**

Before `return plugins;` in `src/core/plugins.js`:

```js
plugins.sort((a, b) => a.name.localeCompare(b.name));
```

**Step 4: Run, verify pass**

```
node --test tests/core/plugins.test.js
```

**Step 5: Commit**

```bash
git add src/core/plugins.js tests/core/plugins.test.js
git commit -m "feat(core): sort discovered plugins by name"
```

---

## Task 4: Update CLI `list` to show uninstalled suffix

**Files:**
- Modify: `src/cli.js` (the `list` command, currently around lines 24-36)

**Note:** `src/cli.js` is excluded from coverage; verification is manual.

**Step 1: Implement**

Replace the `list` command body with:

```js
program
  .command("list")
  .description("List installed plugins")
  .action(async () => {
    const plugins = await discoverPlugins(PLUGINS_DIR);
    if (plugins.length === 0) {
      console.log("No plugins found in plugins/");
      return;
    }
    for (const p of plugins) {
      if (p.state === "uninstalled") {
        console.log(`  ${p.name} - (not installed — run: postkeeper init ${p.name})`);
      } else {
        console.log(`  ${p.name} - ${p.description || "(no description)"}`);
      }
    }
  });
```

**Step 2: Manual verification**

Set up an uninstalled plugin in the local checkout:

```bash
mv plugins/instagram/node_modules /tmp/instagram-node_modules-backup
node src/cli.js list
```

Expected output includes:

```
  instagram - (not installed — run: postkeeper init instagram)
```

(Other plugins should still show their descriptions.)

**Step 3: Restore**

```bash
mv /tmp/instagram-node_modules-backup plugins/instagram/node_modules
node src/cli.js list
```

Expected: instagram row shows its normal description again.

**Step 4: Commit**

```bash
git add src/cli.js
git commit -m "feat(cli): annotate uninstalled plugins in list output"
```

---

## Task 5: Update CLI `status` to handle uninstalled plugins

**Files:**
- Modify: `src/cli.js` (the `status` command, currently around lines 97-127)

**Step 1: Implement**

Add an early branch in the `for (const plugin of targets)` loop, before the `typeof plugin.status !== "function"` check:

```js
if (plugin.state === "uninstalled") {
  console.log(`  ${plugin.name}: not installed — run: postkeeper init ${plugin.name}`);
  continue;
}
```

When `pluginName` is supplied and refers to an uninstalled plugin (so `targets` length is 1 and the only entry is uninstalled), exit non-zero:

```js
if (pluginName && targets.length === 1 && targets[0].state === "uninstalled") {
  console.log(`  ${pluginName}: not installed — run: postkeeper init ${pluginName}`);
  process.exit(1);
}
```

(Place this guard right after the `targets.length === 0` check, so the loop still handles the no-plugin-name case for printing all.)

**Step 2: Manual verification**

```bash
mv plugins/instagram/node_modules /tmp/instagram-node_modules-backup
node src/cli.js status                      # should list all, with instagram marked uninstalled
echo "exit: $?"                             # 0
node src/cli.js status instagram            # should print uninstalled message
echo "exit: $?"                             # 1
mv /tmp/instagram-node_modules-backup plugins/instagram/node_modules
```

**Step 3: Commit**

```bash
git add src/cli.js
git commit -m "feat(cli): handle uninstalled plugins in status command"
```

---

## Task 6: Update CLI `run` to handle uninstalled plugins

**Files:**
- Modify: `src/cli.js` (the `run` command, currently around lines 129-179)

**Step 1: Implement**

Mirror the status command's pattern:

```js
if (pluginName && targets.length === 1 && targets[0].state === "uninstalled") {
  console.error(`  ${pluginName}: not installed — run: postkeeper init ${pluginName}`);
  process.exit(1);
}
```

In the `for (const plugin of targets)` loop, add at the top:

```js
if (plugin.state === "uninstalled") {
  console.log(`\nSkipping ${plugin.name}: not installed — run: postkeeper init ${plugin.name}`);
  continue;
}
```

**Step 2: Manual verification**

```bash
mv plugins/instagram/node_modules /tmp/instagram-node_modules-backup
node src/cli.js run                         # should skip instagram with friendly message, run others
node src/cli.js run instagram               # should error with init hint
echo "exit: $?"                             # 1
mv /tmp/instagram-node_modules-backup plugins/instagram/node_modules
```

**Step 3: Commit**

```bash
git add src/cli.js
git commit -m "feat(cli): handle uninstalled plugins in run command"
```

---

## Task 7: End-to-end verification + push

**Files:** None modified.

**Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass, total count includes 4 new tests from Tasks 1-3.

**Step 2: Run coverage**

```bash
npx c8 --check-coverage --lines 90 --branches 80 --functions 80 \
  --exclude='plugins/instagram/index.js' \
  --exclude='plugins/facebook/index.js' --exclude='plugins/facebook/extractor.js' \
  --exclude='plugins/rss/index.js' \
  --exclude='plugins/meta-archive/index.js' \
  --exclude='plugins/goodreads/index.js' \
  --exclude='plugins/google-photos/index.js' \
  --exclude='plugins/google-photos/extractor.js' \
  --exclude='plugins/google-photos/downloader.js' \
  --exclude='src/cli.js' \
  --exclude='tests/**' --exclude='plugins/*/node_modules/**' \
  node --test
```

Expected: gates pass.

**Step 3: Manual end-to-end demo**

```bash
mv plugins/instagram/node_modules /tmp/ig-nm-backup
node src/cli.js list                # instagram shows (not installed — ...)
node src/cli.js status              # instagram says not installed; others run
node src/cli.js run instagram       # exits 1 with init hint
mv /tmp/ig-nm-backup plugins/instagram/node_modules
```

**Step 4: Push branch and open PR**

```bash
git push -u origin feat/plugin-state-discovery
gh pr create --title "feat: plugin state discovery (quiet uninstalled plugins)" \
             --body "$(cat docs/plans/2026-05-06-plugin-state-discovery-design.md | head -40)"
```

**Step 5: Confirm CI green**

```bash
gh pr checks
```

---

## Out-of-scope reminders

- Do NOT add a postinstall hook to root package.json.
- Do NOT add a `postkeeper install <plugin>` command.
- Do NOT auto-install deps on `run`/`status`. Detection-only; user still runs `postkeeper init <plugin>` to install.
