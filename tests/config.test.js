// tests/config.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, initConfigDir } from "../src/config.js";

describe("loadConfig", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-config-test");

  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("loads config with plugins section", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        plugins: {
          instagram: { profiles: ["user1"], profile_dir: "./.bp" },
        },
      })
    );
    const config = loadConfig(configPath);
    assert.deepStrictEqual(config.plugins.instagram.profiles, ["user1"]);
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

describe("initConfigDir", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-initconfig-test");
  let savedConfigDir;

  beforeEach(() => {
    savedConfigDir = process.env.POSTKEEPER_CONFIG_DIR;
    process.env.POSTKEEPER_CONFIG_DIR = tmpDir;
  });

  afterEach(() => {
    if (savedConfigDir === undefined) {
      delete process.env.POSTKEEPER_CONFIG_DIR;
    } else {
      process.env.POSTKEEPER_CONFIG_DIR = savedConfigDir;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates directory and default config when missing", () => {
    const result = initConfigDir();
    assert.strictEqual(result.created, true);
    assert.strictEqual(result.configDir, tmpDir);
    assert.strictEqual(result.configPath, join(tmpDir, "config.json"));
    assert.ok(existsSync(join(tmpDir, "config.json")));

    const content = JSON.parse(readFileSync(join(tmpDir, "config.json"), "utf-8"));
    assert.deepStrictEqual(content, { plugins: {} });
  });

  test("does not overwrite existing config", () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, "config.json");
    const existing = { plugins: { instagram: { profiles: ["alice"] } } };
    writeFileSync(configPath, JSON.stringify(existing));

    const result = initConfigDir();
    assert.strictEqual(result.created, false);

    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    assert.deepStrictEqual(content, existing);
  });
});
