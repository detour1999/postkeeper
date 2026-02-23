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

  test("loads config from a JSON file", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({
      profiles: ["user1", "user2"],
      output_dir: "./out",
      profile_dir: "./.bp"
    }));
    const config = loadConfig(configPath);
    assert.deepStrictEqual(config.profiles, ["user1", "user2"]);
    assert.strictEqual(config.output_dir, "./out");
    assert.strictEqual(config.profile_dir, "./.bp");
  });

  test("throws if config file is missing", () => {
    assert.throws(() => loadConfig(join(tmpDir, "nope.json")), /ENOENT|not found/i);
  });

  test("throws if profiles is empty", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ profiles: [] }));
    assert.throws(() => loadConfig(configPath), /profiles/i);
  });
});
