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
        async poll(config, context) { return { posts: [], state: {} }; },
      };`
    );

    const plugins = await discoverPlugins(pluginsDir);
    assert.strictEqual(plugins.length, 1);
    assert.strictEqual(plugins[0].name, "test-plugin");
    assert.strictEqual(typeof plugins[0].poll, "function");
    assert.strictEqual(typeof plugins[0].init, "function");
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
});
