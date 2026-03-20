#!/usr/bin/env node
// ABOUTME: CLI entry point for Postkeeper — parses commands and dispatches to core/plugins.
// ABOUTME: Supports init, list, status, and run commands for managing social media archiving.
import { Command } from "commander";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { loadConfig, initConfigDir, savePluginConfig } from "./config.js";
import { discoverPlugins } from "./core/plugins.js";
import { runPlugin } from "./core/orchestrator.js";
import { getConfigPath, getArchiveDir, getPluginDataDir } from "./core/paths.js";
import { createPrompt } from "./core/prompt.js";

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
      console.log(`  ${p.name} - ${p.description || "(no description)"}`);
    }
  });

async function initPlugin(plugin, pluginName, config, promptFn) {
  const pluginDir = join(PLUGINS_DIR, pluginName);
  const pluginPkgJson = join(pluginDir, "package.json");
  if (existsSync(pluginPkgJson)) {
    console.log(`Installing dependencies for ${pluginName}...`);
    execFileSync("npm", ["install"], { cwd: pluginDir, stdio: "inherit" });
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

program
  .command("status [plugin]")
  .description("Check plugin connectivity/auth status")
  .action(async (pluginName) => {
    const config = loadConfig(getConfigPath());
    const plugins = await discoverPlugins(PLUGINS_DIR);
    const targets = pluginName ? plugins.filter((p) => p.name === pluginName) : plugins;

    if (targets.length === 0) {
      console.error(pluginName ? `Plugin "${pluginName}" not found.` : "No plugins found.");
      process.exit(1);
    }

    for (const plugin of targets) {
      if (typeof plugin.status !== "function") {
        console.log(`  ${plugin.name}: OK (no status check)`);
        continue;
      }
      try {
        const pluginConfig = config.plugins[plugin.name] || {};
        const context = {
          dataDir: getPluginDataDir(plugin.name),
          log: (msg) => console.log(`  [${plugin.name}] ${msg}`),
        };
        const result = await plugin.status(pluginConfig, context);
        console.log(`  ${plugin.name}: ${result.ok ? "OK" : "ERROR"} - ${result.message}`);
      } catch (err) {
        console.log(`  ${plugin.name}: ERROR - ${err.message}`);
      }
    }
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

    for (const plugin of targets) {
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
            continue;
          }
        } catch (err) {
          console.error(`  Skipping ${plugin.name}: status check failed - ${err.message}`);
          continue;
        }
      }

      try {
        await runPlugin(plugin, config.plugins[plugin.name] || {}, archiveDir);
        console.log(`  ${plugin.name} done.`);
      } catch (err) {
        console.error(`  Error running ${plugin.name}: ${err.message}`);
      }

      // Shutdown if supported
      if (typeof plugin.shutdown === "function") {
        await plugin.shutdown();
      }
    }

    console.log("\nDone.");
  });

program.parse();
