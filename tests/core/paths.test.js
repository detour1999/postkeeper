import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  getConfigDir,
  getDataDir,
  getConfigPath,
  getArchiveDir,
  getPluginDataDir,
} from "../../src/core/paths.js";

describe("paths", () => {
  let savedConfigDir;
  let savedDataDir;

  beforeEach(() => {
    savedConfigDir = process.env.POSTKEEPER_CONFIG_DIR;
    savedDataDir = process.env.POSTKEEPER_DATA_DIR;
    delete process.env.POSTKEEPER_CONFIG_DIR;
    delete process.env.POSTKEEPER_DATA_DIR;
  });

  afterEach(() => {
    if (savedConfigDir === undefined) {
      delete process.env.POSTKEEPER_CONFIG_DIR;
    } else {
      process.env.POSTKEEPER_CONFIG_DIR = savedConfigDir;
    }
    if (savedDataDir === undefined) {
      delete process.env.POSTKEEPER_DATA_DIR;
    } else {
      process.env.POSTKEEPER_DATA_DIR = savedDataDir;
    }
  });

  test("getConfigDir defaults to ~/.config/postkeeper", () => {
    const expected = join(homedir(), ".config", "postkeeper");
    assert.strictEqual(getConfigDir(), expected);
  });

  test("getConfigDir respects POSTKEEPER_CONFIG_DIR env var", () => {
    process.env.POSTKEEPER_CONFIG_DIR = "/tmp/custom-config";
    assert.strictEqual(getConfigDir(), "/tmp/custom-config");
  });

  test("getDataDir defaults to ~/.local/share/postkeeper", () => {
    const expected = join(homedir(), ".local", "share", "postkeeper");
    assert.strictEqual(getDataDir(), expected);
  });

  test("getDataDir respects POSTKEEPER_DATA_DIR env var", () => {
    process.env.POSTKEEPER_DATA_DIR = "/tmp/custom-data";
    assert.strictEqual(getDataDir(), "/tmp/custom-data");
  });

  test("getConfigPath returns config dir + config.json", () => {
    const expected = join(homedir(), ".config", "postkeeper", "config.json");
    assert.strictEqual(getConfigPath(), expected);
  });

  test("getConfigPath uses custom config dir from env", () => {
    process.env.POSTKEEPER_CONFIG_DIR = "/tmp/custom-config";
    assert.strictEqual(getConfigPath(), join("/tmp/custom-config", "config.json"));
  });

  test("getArchiveDir returns data dir + archive", () => {
    const expected = join(homedir(), ".local", "share", "postkeeper", "archive");
    assert.strictEqual(getArchiveDir(), expected);
  });

  test("getArchiveDir uses custom data dir from env", () => {
    process.env.POSTKEEPER_DATA_DIR = "/tmp/custom-data";
    assert.strictEqual(getArchiveDir(), join("/tmp/custom-data", "archive"));
  });

  test("getPluginDataDir returns data dir + plugin name", () => {
    const expected = join(homedir(), ".local", "share", "postkeeper", "instagram");
    assert.strictEqual(getPluginDataDir("instagram"), expected);
  });

  test("getPluginDataDir uses custom data dir from env", () => {
    process.env.POSTKEEPER_DATA_DIR = "/tmp/custom-data";
    assert.strictEqual(getPluginDataDir("instagram"), join("/tmp/custom-data", "instagram"));
  });
});
