import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
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

    // Pipe "n" for each plugin to decline all setup prompts
    const declineAll = "n\nn\nn\nn\nn\n";
    const output = execFileSync("node", [cli, "init"], { encoding: "utf-8", env: execEnv, input: declineAll });
    assert.ok(output.includes("Created config directory"));
    assert.ok(existsSync(join(tmpConfigDir, "config.json")));

    const config = JSON.parse(readFileSync(join(tmpConfigDir, "config.json"), "utf-8"));
    assert.deepStrictEqual(config, { plugins: {} });
  });

  test("bare init reports existing config dir", () => {
    // Config already exists from beforeEach
    const declineAll = "n\nn\nn\nn\nn\n";
    const output = execFileSync("node", [cli, "init"], { encoding: "utf-8", env: execEnv, input: declineAll });
    assert.ok(output.includes("already exists"));
  });

  test("bare init prompts for each plugin", () => {
    const declineAll = "n\nn\nn\nn\nn\n";
    const output = execFileSync("node", [cli, "init"], { encoding: "utf-8", env: execEnv, input: declineAll });
    assert.ok(output.includes("Set up"));
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

  describe("session set", () => {
    const cookies = JSON.stringify([
      { name: "_session_id2", value: "abc123", domain: ".goodreads.com", path: "/" },
    ]);

    function sessionSet(args, input) {
      return execFileSync("node", [cli, "session", "set", ...args], {
        encoding: "utf-8",
        stdio: "pipe",
        env: execEnv,
        input,
      });
    }

    test("rejects an unknown plugin", () => {
      assert.throws(
        () => sessionSet(["nonexistent"], cookies),
        (err) => err.status !== 0 && /not found/i.test(err.stderr),
      );
    });

    test("rejects a plugin that does not support session handover", () => {
      assert.throws(
        () => sessionSet(["meta-archive"], cookies),
        (err) => err.status !== 0 && /does not support session handover/i.test(err.stderr),
      );
    });

    test("reports unparseable cookie input without touching the plugin", () => {
      assert.throws(
        () => sessionSet(["goodreads"], "_session_id2=abc; path=/"),
        (err) => err.status !== 0 && /not valid JSON/i.test(err.stderr),
      );
    });

    test("reads cookies from --file", () => {
      const cookieFile = join(tmpConfigDir, "cookies.json");
      writeFileSync(cookieFile, cookies);
      assert.throws(
        // meta-archive stands in for "reached plugin dispatch": the cookies
        // parsed, so the failure is the missing hook, not the file read.
        () => sessionSet(["meta-archive", "--file", cookieFile]),
        (err) => err.status !== 0 && /does not support session handover/i.test(err.stderr),
      );
    });

    test("reports a missing --file", () => {
      assert.throws(
        () => sessionSet(["goodreads", "--file", join(tmpConfigDir, "absent.json")]),
        (err) => err.status !== 0 && /absent\.json/.test(err.stderr),
      );
    });

    test("--json emits a machine-readable failure", () => {
      assert.throws(
        () => sessionSet(["meta-archive", "--json"], cookies),
        (err) => {
          const payload = JSON.parse(err.stdout);
          return (
            err.status !== 0 &&
            payload.ok === false &&
            payload.plugin === "meta-archive" &&
            typeof payload.message === "string"
          );
        },
      );
    });
  });

  describe("run exit codes", () => {
    // A plugin skipped because its pre-flight auth check failed must not look
    // like a successful run, or an agent polling `run` never learns it is
    // signed out.
    test("exits non-zero when a plugin is skipped by a failed status check", () => {
      writeFileSync(
        join(tmpConfigDir, "config.json"),
        JSON.stringify({ plugins: { goodreads: { user_id: "168273107" } } }, null, 2),
      );

      assert.throws(
        () =>
          execFileSync("node", [cli, "run", "goodreads"], {
            encoding: "utf-8",
            stdio: "pipe",
            env: execEnv,
          }),
        (err) => err.status === 1 && /No browser profile found/.test(err.stderr + err.stdout),
      );
    });

    // Being uninstalled or unconfigured is a configuration state, not a
    // failure, so a sweep over every plugin still succeeds. The config here is
    // empty, so every plugin is skipped for one reason or the other — which of
    // the two depends on whether plugin dependencies are installed on this
    // machine, so this asserts the exit code rather than the skip reason.
    test("stays zero when running all plugins and every one is skipped", () => {
      const result = spawnSync("node", [cli, "run"], { encoding: "utf-8", env: execEnv });

      // An uninstalled plugin logs its skip to stdout and an unconfigured one to
      // stderr, so match against both rather than caring which reason applies.
      const combined = result.stdout + result.stderr;

      assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}:\n${combined}`);
      assert.ok(/Skipping/.test(combined), `Expected plugins to be skipped:\n${combined}`);
      assert.ok(/Done\./.test(result.stdout));
      assert.ok(!/Failed:/.test(result.stderr), `Expected no failures reported:\n${result.stderr}`);
    });
  });

  describe("status --json", () => {
    test("emits parseable JSON for every plugin", () => {
      let stdout;
      try {
        stdout = execFileSync("node", [cli, "status", "--json"], {
          encoding: "utf-8",
          stdio: "pipe",
          env: execEnv,
        });
      } catch (err) {
        // Uninstalled plugins make the overall status not-ok, which is a
        // non-zero exit. The payload is what this test cares about.
        stdout = err.stdout;
      }

      const payload = JSON.parse(stdout);
      assert.ok(Array.isArray(payload.plugins));
      const names = payload.plugins.map((p) => p.name);
      assert.ok(names.includes("goodreads"));
      for (const entry of payload.plugins) {
        assert.strictEqual(typeof entry.ok, "boolean");
        assert.strictEqual(typeof entry.state, "string");
      }
    });

    test("exits non-zero when a plugin is not ok", () => {
      assert.throws(
        () =>
          execFileSync("node", [cli, "status", "instagram", "--json"], {
            encoding: "utf-8",
            stdio: "pipe",
            env: execEnv,
          }),
        (err) => {
          const payload = JSON.parse(err.stdout);
          return err.status === 1 && payload.ok === false;
        },
      );
    });

    test("keeps the human output unchanged without --json", () => {
      let stdout;
      try {
        stdout = execFileSync("node", [cli, "status"], {
          encoding: "utf-8",
          stdio: "pipe",
          env: execEnv,
        });
      } catch (err) {
        stdout = err.stdout;
      }
      assert.ok(/goodreads:/.test(stdout));
      assert.ok(!stdout.trimStart().startsWith("{"));
    });
  });
});
