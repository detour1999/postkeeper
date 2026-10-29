#!/usr/bin/env node
// ABOUTME: CLI entry point for Postkeeper — parses commands and dispatches to core/plugins.
// ABOUTME: Supports init, list, status, and run commands for managing social media archiving.
import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { loadConfig, initConfigDir, savePluginConfig } from "./config.js";
import { discoverPlugins } from "./core/plugins.js";
import { runPlugin } from "./core/orchestrator.js";
import { getConfigPath, getArchiveDir, getPluginDataDir } from "./core/paths.js";
import { createPrompt } from "./core/prompt.js";
import { parseCookieInput, summarizeCookies } from "./core/session.js";

const PROJECT_ROOT = dirname(import.meta.dirname);
const PLUGINS_DIR = join(PROJECT_ROOT, "plugins");

const program = new Command();

program
  .name("postkeeper")
  .description("Local social media archiver with plugin support")
  .version("0.1.0");

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

async function initPlugin(plugin, pluginName, config, promptFn) {
  const pluginDir = join(PLUGINS_DIR, pluginName);
  const pluginPkgJson = join(pluginDir, "package.json");
  if (existsSync(pluginPkgJson)) {
    console.log(`Installing dependencies for ${pluginName}...`);
    execFileSync("npm", ["install"], { cwd: pluginDir, stdio: "inherit" });
  }

  // If we started with a stub, deps are on disk now but Node's ESM cache may
  // hold the prior import failure (especially for transitive imports that
  // forceReload doesn't reach). Re-exec the CLI in a fresh process so the
  // child sees a clean module cache. The env guard prevents an infinite loop
  // if the install genuinely doesn't fix the load.
  if (plugin.state === "uninstalled") {
    if (process.env.POSTKEEPER_REEXEC_AFTER_INSTALL) {
      console.error(`Plugin "${pluginName}" failed to load after install.`);
      process.exit(1);
    }
    const result = spawnSync(process.execPath, process.argv.slice(1), {
      stdio: "inherit",
      env: { ...process.env, POSTKEEPER_REEXEC_AFTER_INSTALL: "1" },
    });
    process.exit(result.status ?? 1);
  }

  const pluginConfig = config.plugins[pluginName] || {};
  const context = {
    dataDir: getPluginDataDir(pluginName),
    log: (msg) => console.log(`  [${pluginName}] ${msg}`),
    prompt: promptFn,
    saveConfig: (newConfig) => savePluginConfig(pluginName, newConfig),
  };
  await plugin.init(pluginConfig, context);
}

program
  .command("init [plugin]")
  .description("Run first-time setup for a plugin")
  .action(async (pluginName) => {
    const { created, configDir } = initConfigDir();
    if (created) {
      console.log(`Created config directory: ${configDir}`);
    } else {
      console.log(`Config directory already exists: ${configDir}`);
    }

    let config = loadConfig(getConfigPath());
    const plugins = await discoverPlugins(PLUGINS_DIR);
    const { prompt, close } = createPrompt();

    try {
      if (pluginName) {
        const plugin = plugins.find((p) => p.name === pluginName);
        if (!plugin) {
          console.error(`Plugin "${pluginName}" not found. Run "postkeeper list" to see available plugins.`);
          process.exit(1);
        }
        await initPlugin(plugin, pluginName, config, prompt);
      } else {
        for (const plugin of plugins) {
          config = loadConfig(getConfigPath());
          const existing = config.plugins[plugin.name];
          const question = existing
            ? `${plugin.name} is already configured. Reconfigure? (y/n)`
            : `Set up ${plugin.name}? (y/n)`;
          const answer = await prompt(question);
          if (answer.trim().toLowerCase() === "y") {
            await initPlugin(plugin, plugin.name, config, prompt);
          }
        }
      }
    } finally {
      close();
    }
  });

async function collectStatus(plugins, config, { quiet = false } = {}) {
  const entries = [];

  for (const plugin of plugins) {
    if (plugin.state === "uninstalled") {
      entries.push({
        name: plugin.name,
        state: "uninstalled",
        ok: false,
        message: `not installed — run: postkeeper init ${plugin.name}`,
      });
      continue;
    }
    if (typeof plugin.status !== "function") {
      entries.push({ name: plugin.name, state: "loaded", ok: true, message: "no status check" });
      continue;
    }
    try {
      const pluginConfig = config.plugins[plugin.name] || {};
      const context = {
        dataDir: getPluginDataDir(plugin.name),
        log: (msg) => {
          if (!quiet) console.log(`  [${plugin.name}] ${msg}`);
        },
      };
      const result = await plugin.status(pluginConfig, context);
      entries.push({
        name: plugin.name,
        state: "loaded",
        ok: Boolean(result.ok),
        message: result.message || "",
      });
    } catch (err) {
      entries.push({ name: plugin.name, state: "loaded", ok: false, message: err.message });
    }
  }

  return entries;
}

program
  .command("status [plugin]")
  .description("Check plugin connectivity/auth status")
  .option("--json", "Emit machine-readable JSON instead of text")
  .action(async (pluginName, options) => {
    const config = loadConfig(getConfigPath());
    const plugins = await discoverPlugins(PLUGINS_DIR);
    const targets = pluginName ? plugins.filter((p) => p.name === pluginName) : plugins;

    if (targets.length === 0) {
      const message = pluginName ? `Plugin "${pluginName}" not found.` : "No plugins found.";
      if (options.json) {
        console.log(JSON.stringify({ ok: false, plugins: [], message }, null, 2));
      } else {
        console.error(message);
      }
      process.exit(1);
    }

    // Plugin status output is interleaved with the report in text mode; in JSON
    // mode it would corrupt the payload, so suppress it there.
    const entries = await collectStatus(targets, config, { quiet: options.json });
    const ok = entries.every((e) => e.ok);

    if (options.json) {
      console.log(JSON.stringify({ ok, plugins: entries }, null, 2));
    } else {
      for (const entry of entries) {
        if (entry.state === "uninstalled") {
          console.log(`  ${entry.name}: ${entry.message}`);
        } else {
          console.log(`  ${entry.name}: ${entry.ok ? "OK" : "ERROR"} - ${entry.message}`);
        }
      }
    }

    // Exit non-zero so an agent can branch on auth having lapsed.
    if (!ok) process.exit(1);
  });

program
  .command("run [plugin]")
  .description("Run plugins to fetch/import posts")
  .action(async (pluginName) => {
    const config = loadConfig(getConfigPath());
    const archiveDir = getArchiveDir();
    const plugins = await discoverPlugins(PLUGINS_DIR);
    const targets = pluginName ? plugins.filter((p) => p.name === pluginName) : plugins;

    if (targets.length === 0) {
      console.error(pluginName ? `Plugin "${pluginName}" not found.` : "No plugins found.");
      process.exit(1);
    }

    if (pluginName && targets.length === 1 && targets[0].state === "uninstalled") {
      console.error(`  ${pluginName}: not installed — run: postkeeper init ${pluginName}`);
      process.exit(1);
    }

    // A failed pre-flight check means "not configured yet" for one plugin and
    // "signed out" for another — status() can't tell them apart. So a skip only
    // sets the exit code when this plugin was the one asked for; a sweep over
    // plugins in mixed states stays quiet. A thrown error is a failure either way.
    const skipped = [];
    const errored = [];

    for (const plugin of targets) {
      if (plugin.state === "uninstalled") {
        console.log(`\nSkipping ${plugin.name}: not installed — run: postkeeper init ${plugin.name}`);
        continue;
      }
      console.log(`\nRunning ${plugin.name}...`);

      // Pre-flight status check
      if (typeof plugin.status === "function") {
        try {
          const pluginConfig = config.plugins[plugin.name] || {};
          const context = {
            dataDir: getPluginDataDir(plugin.name),
            log: (msg) => console.log(`  [${plugin.name}] ${msg}`),
          };
          const status = await plugin.status(pluginConfig, context);
          if (!status.ok) {
            console.error(`  Skipping ${plugin.name}: ${status.message}`);
            skipped.push(plugin.name);
            continue;
          }
        } catch (err) {
          console.error(`  Skipping ${plugin.name}: status check failed - ${err.message}`);
          skipped.push(plugin.name);
          continue;
        }
      }

      try {
        await runPlugin(plugin, config.plugins[plugin.name] || {}, archiveDir);
        console.log(`  ${plugin.name} done.`);
      } catch (err) {
        console.error(`  Error running ${plugin.name}: ${err.message}`);
        errored.push(plugin.name);
      }

      // Shutdown if supported
      if (typeof plugin.shutdown === "function") {
        await plugin.shutdown();
      }
    }

    console.log("\nDone.");

    const failed = pluginName ? [...skipped, ...errored] : errored;
    if (failed.length > 0) {
      console.error(`Failed: ${failed.join(", ")}`);
      process.exit(1);
    }
  });

const session = program
  .command("session")
  .description("Hand a browser session to a plugin (for agent-driven login)");

session
  .command("set <plugin>")
  .description("Install cookies into a plugin's browser session (JSON on stdin, or --file)")
  .option("--file <path>", "Read cookie JSON from a file instead of stdin")
  .option("--json", "Emit machine-readable JSON instead of text")
  .action(async (pluginName, options) => {
    const fail = (message) => {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, plugin: pluginName, message }, null, 2));
      } else {
        console.error(message);
      }
      process.exit(1);
    };

    const config = loadConfig(getConfigPath());
    const plugins = await discoverPlugins(PLUGINS_DIR);
    const plugin = plugins.find((p) => p.name === pluginName);

    if (!plugin) {
      fail(`Plugin "${pluginName}" not found. Run "postkeeper list" to see available plugins.`);
      return;
    }
    if (plugin.state === "uninstalled") {
      fail(`Plugin "${pluginName}" is not installed — run: postkeeper init ${pluginName}`);
      return;
    }
    if (typeof plugin.setSession !== "function") {
      fail(`Plugin "${pluginName}" does not support session handover.`);
      return;
    }

    let input;
    try {
      if (options.file) {
        input = readFileSync(options.file, "utf-8");
      } else if (process.stdin.isTTY) {
        fail("No cookie JSON on stdin. Pipe it in, or pass --file <path>.");
        return;
      } else {
        input = readFileSync(0, "utf-8");
      }
    } catch (err) {
      fail(`Could not read cookie input: ${err.message}`);
      return;
    }

    let cookies;
    try {
      cookies = parseCookieInput(input);
    } catch (err) {
      fail(err.message);
      return;
    }

    const summary = summarizeCookies(cookies);
    const context = {
      dataDir: getPluginDataDir(pluginName),
      log: (msg) => {
        if (!options.json) console.log(`  [${pluginName}] ${msg}`);
      },
    };

    try {
      await plugin.setSession(cookies, config.plugins[pluginName] || {}, context);
    } catch (err) {
      fail(`Could not install session for "${pluginName}": ${err.message}`);
      return;
    }

    const message = `Installed ${cookies.length} cookie(s) for ${pluginName}.`;
    if (options.json) {
      console.log(JSON.stringify({ ok: true, plugin: pluginName, cookies: summary, message }, null, 2));
    } else {
      console.log(message);
      for (const c of summary) {
        console.log(`  ${c.name} (${c.domain}) expires: ${c.expires}`);
      }
      console.log(`Verify with: postkeeper status ${pluginName}`);
    }
  });

program.parse();
