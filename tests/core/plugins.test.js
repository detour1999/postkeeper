import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverPlugins } from "../../src/core/plugins.js";

describe("discoverPlugins", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-plugins-test");
  const pluginsDir = join(tmpDir, "plugins");

  beforeEach(() => mkdirSync(pluginsDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("discovers plugins with index.js and required exports", async () => {
    const pluginDir = join(pluginsDir, "test-plugin");
    mkdirSync(pluginDir);
    writeFileSync(
      join(pluginDir, "index.js"),
      `export default {
        name: "test-plugin",
        description: "A test plugin",
        async init(config) {},
        async run(config, context) { return { posts: [], state: {} }; },
      };`
    );

    const plugins = await discoverPlugins(pluginsDir);
    assert.strictEqual(plugins.length, 1);
    assert.strictEqual(plugins[0].name, "test-plugin");
    assert.strictEqual(typeof plugins[0].run, "function");
    assert.strictEqual(typeof plugins[0].init, "function");
  });

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

  test("skips directories without index.js", async () => {
    mkdirSync(join(pluginsDir, "empty-dir"));
    const plugins = await discoverPlugins(pluginsDir);
    assert.strictEqual(plugins.length, 0);
  });

  test("skips plugins missing required exports", async () => {
    const pluginDir = join(pluginsDir, "bad-plugin");
    mkdirSync(pluginDir);
    writeFileSync(
      join(pluginDir, "index.js"),
      `export default { name: "bad" };`
    );

    const plugins = await discoverPlugins(pluginsDir);
    assert.strictEqual(plugins.length, 0);
  });

  test("returns empty array when plugins dir does not exist", async () => {
    const plugins = await discoverPlugins(join(tmpDir, "nonexistent"));
    assert.deepStrictEqual(plugins, []);
  });

  test("returns 'uninstalled' state when package.json exists but node_modules does not", async () => {
    const pluginDir = join(pluginsDir, "needy-plugin");
    mkdirSync(pluginDir);
    writeFileSync(
      join(pluginDir, "package.json"),
      JSON.stringify({ name: "needy-plugin", dependencies: { "some-missing-pkg": "^1.0.0" } })
    );
    writeFileSync(
      join(pluginDir, "index.js"),
      `import "some-missing-pkg";\nexport default { name: "needy-plugin", async init() {}, async run() { return { posts: [] } } };`
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

  test("returns plugins sorted by name", async () => {
    for (const name of ["zeta", "alpha", "mu"]) {
      const dir = join(pluginsDir, name);
      mkdirSync(dir);
      writeFileSync(
        join(dir, "index.js"),
        `export default { name: "${name}", async init() {}, async run() { return { posts: [] } } };`
      );
    }

    const plugins = await discoverPlugins(pluginsDir);
    assert.deepStrictEqual(
      plugins.map((p) => p.name),
      ["alpha", "mu", "zeta"]
    );
  });

  test("forceReload re-imports plugin index even when previously cached", async () => {
    const pluginDir = join(pluginsDir, "reloadable");
    mkdirSync(pluginDir);
    const indexPath = join(pluginDir, "index.js");
    writeFileSync(
      indexPath,
      `export default { name: "before", async init() {}, async run() { return { posts: [] } } };`
    );

    const first = await discoverPlugins(pluginsDir);
    assert.strictEqual(first.length, 1);
    assert.strictEqual(first[0].name, "before");

    writeFileSync(
      indexPath,
      `export default { name: "after", async init() {}, async run() { return { posts: [] } } };`
    );

    const second = await discoverPlugins(pluginsDir, { forceReload: true });
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].name, "after");
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
});
