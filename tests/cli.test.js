import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cli = resolve(import.meta.dirname, "../src/cli.js");

describe("CLI", () => {
  let tmpConfigDir;
  let tmpDataDir;
  let execEnv;

  beforeEach(() => {
    tmpConfigDir = mkdtempSync(join(tmpdir(), "pk-config-"));
    tmpDataDir = mkdtempSync(join(tmpdir(), "pk-data-"));
    writeFileSync(join(tmpConfigDir, "config.json"), JSON.stringify({ plugins: {} }, null, 2) + "\n");
    execEnv = {
      ...process.env,
      POSTKEEPER_CONFIG_DIR: tmpConfigDir,
      POSTKEEPER_DATA_DIR: tmpDataDir,
    };
  });

  afterEach(() => {
    rmSync(tmpConfigDir, { recursive: true, force: true });
    rmSync(tmpDataDir, { recursive: true, force: true });
  });

  test("--help shows usage", () => {
    const output = execFileSync("node", [cli, "--help"], { encoding: "utf-8", env: execEnv });
    assert.ok(output.includes("postkeeper"));
    assert.ok(output.includes("list"));
    assert.ok(output.includes("run"));
  });

  test("--version shows version", () => {
    const output = execFileSync("node", [cli, "--version"], { encoding: "utf-8", env: execEnv });
    assert.match(output.trim(), /^\d+\.\d+\.\d+$/);
  });

  test("list shows installed plugins", () => {
    const output = execFileSync("node", [cli, "list"], { encoding: "utf-8", env: execEnv });
    assert.ok(output.includes("instagram"));
  });

  test("bare init creates config dir and default config", () => {
    // Remove the pre-created config so init has to create it
    rmSync(tmpConfigDir, { recursive: true, force: true });
    mkdirSync(tmpConfigDir, { recursive: true });
    // No config.json exists yet

    const output = execFileSync("node", [cli, "init"], { encoding: "utf-8", env: execEnv });
    assert.ok(output.includes("Created config directory"));
    assert.ok(existsSync(join(tmpConfigDir, "config.json")));

    const config = JSON.parse(readFileSync(join(tmpConfigDir, "config.json"), "utf-8"));
    assert.deepStrictEqual(config, { plugins: {} });
  });

  test("bare init reports existing config dir", () => {
    // Config already exists from beforeEach
    const output = execFileSync("node", [cli, "init"], { encoding: "utf-8", env: execEnv });
    assert.ok(output.includes("already exists"));
  });

  test("init with unknown plugin fails", () => {
    assert.throws(
      () => execFileSync("node", [cli, "init", "nonexistent"], { encoding: "utf-8", stdio: "pipe", env: execEnv }),
      (err) => err.status !== 0
    );
  });

  test("status with unknown plugin fails", () => {
    assert.throws(
      () => execFileSync("node", [cli, "status", "nonexistent"], { encoding: "utf-8", stdio: "pipe", env: execEnv }),
      (err) => err.status !== 0
    );
  });

  test("run with unknown plugin fails", () => {
    assert.throws(
      () => execFileSync("node", [cli, "run", "nonexistent"], { encoding: "utf-8", stdio: "pipe", env: execEnv }),
      (err) => err.status !== 0
    );
  });

  test("works from a different working directory", () => {
    const output = execFileSync("node", [cli, "list"], { encoding: "utf-8", cwd: "/tmp", env: execEnv });
    assert.ok(output.includes("instagram"));
  });
});
