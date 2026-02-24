// tests/config.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-config-test");

  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("loads config with archive_dir and plugins section", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        archive_dir: "./my-archive",
        plugins: {
          instagram: { profiles: ["user1"], profile_dir: "./.bp" },
        },
      })
    );
    const config = loadConfig(configPath);
    assert.strictEqual(config.archive_dir, "./my-archive");
    assert.deepStrictEqual(config.plugins.instagram.profiles, ["user1"]);
  });

  test("applies default archive_dir", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ plugins: {} }));
    const config = loadConfig(configPath);
    assert.strictEqual(config.archive_dir, "./archive");
  });

  test("throws if config file is missing", () => {
    assert.throws(() => loadConfig(join(tmpDir, "nope.json")), /ENOENT|not found/i);
  });

  test("defaults plugins to empty object if missing", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({}));
    const config = loadConfig(configPath);
    assert.deepStrictEqual(config.plugins, {});
  });
});
