import { test, describe } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const cli = resolve(import.meta.dirname, "../src/cli.js");

describe("CLI", () => {
  test("--help shows usage", () => {
    const output = execFileSync("node", [cli, "--help"], { encoding: "utf-8" });
    assert.ok(output.includes("postkeeper"));
    assert.ok(output.includes("list"));
    assert.ok(output.includes("run"));
  });

  test("--version shows version", () => {
    const output = execFileSync("node", [cli, "--version"], { encoding: "utf-8" });
    assert.match(output.trim(), /^\d+\.\d+\.\d+$/);
  });

  test("list shows installed plugins", () => {
    const output = execFileSync("node", [cli, "list"], { encoding: "utf-8" });
    assert.ok(output.includes("instagram"));
  });

  test("init with unknown plugin fails", () => {
    assert.throws(
      () => execFileSync("node", [cli, "init", "nonexistent"], { encoding: "utf-8", stdio: "pipe" }),
      (err) => err.status !== 0
    );
  });

  test("status with unknown plugin fails", () => {
    assert.throws(
      () => execFileSync("node", [cli, "status", "nonexistent"], { encoding: "utf-8", stdio: "pipe" }),
      (err) => err.status !== 0
    );
  });

  test("run with unknown plugin fails", () => {
    assert.throws(
      () => execFileSync("node", [cli, "run", "nonexistent"], { encoding: "utf-8", stdio: "pipe" }),
      (err) => err.status !== 0
    );
  });

  test("works from a different working directory", () => {
    const output = execFileSync("node", [cli, "list"], { encoding: "utf-8", cwd: "/tmp" });
    assert.ok(output.includes("instagram"));
  });
});
