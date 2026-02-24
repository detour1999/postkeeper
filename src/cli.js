#!/usr/bin/env node
// src/cli.js
import { Command } from "commander";
import { resolve, join } from "node:path";
import { loadConfig } from "./config.js";
import { discoverPlugins } from "./core/plugins.js";
import { runPoll } from "./core/orchestrator.js";

const program = new Command();

program
  .name("postkeeper")
  .description("Local social media archiver with plugin support")
  .version("0.1.0");

program
  .command("list")
  .description("List installed plugins")
  .action(async () => {
    const plugins = await discoverPlugins(resolve("plugins"));
    if (plugins.length === 0) {
      console.log("No plugins found in plugins/");
      return;
    }
    for (const p of plugins) {
      console.log(`  ${p.name} - ${p.description || "(no description)"}`);
    }
  });

program
  .command("init <plugin>")
  .description("Run first-time setup for a plugin")
  .action(async (pluginName) => {
    const config = loadConfig("config.json");
    const plugins = await discoverPlugins(resolve("plugins"));
    const plugin = plugins.find((p) => p.name === pluginName);
    if (!plugin) {
      console.error(`Plugin "${pluginName}" not found. Run "postkeeper list" to see available plugins.`);
      process.exit(1);
    }
    await plugin.init(config.plugins[pluginName] || {});
  });

program
  .command("status [plugin]")
  .description("Check plugin connectivity/auth status")
  .action(async (pluginName) => {
    const config = loadConfig("config.json");
    const plugins = await discoverPlugins(resolve("plugins"));
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
        const result = await plugin.status(config.plugins[plugin.name] || {});
        console.log(`  ${plugin.name}: ${result.ok ? "OK" : "ERROR"} - ${result.message}`);
      } catch (err) {
        console.log(`  ${plugin.name}: ERROR - ${err.message}`);
      }
    }
  });

program
  .command("poll [plugin]")
  .description("Poll for new posts")
  .action(async (pluginName) => {
    const config = loadConfig("config.json");
    const archiveDir = resolve(config.archive_dir);
    const plugins = await discoverPlugins(resolve("plugins"));
    const targets = pluginName ? plugins.filter((p) => p.name === pluginName) : plugins;

    if (targets.length === 0) {
      console.error(pluginName ? `Plugin "${pluginName}" not found.` : "No plugins found.");
      process.exit(1);
    }

    for (const plugin of targets) {
      console.log(`\nPolling ${plugin.name}...`);

      // Pre-flight status check
      if (typeof plugin.status === "function") {
        try {
          const status = await plugin.status(config.plugins[plugin.name] || {});
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
        await runPoll(plugin, config.plugins[plugin.name] || {}, archiveDir);
        console.log(`  ${plugin.name} done.`);
      } catch (err) {
        console.error(`  Error polling ${plugin.name}: ${err.message}`);
      }

      // Shutdown if supported
      if (typeof plugin.shutdown === "function") {
        await plugin.shutdown();
      }
    }

    console.log("\nDone.");
  });

program.parse();
