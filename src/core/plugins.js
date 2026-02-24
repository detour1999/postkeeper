import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function discoverPlugins(pluginsDir) {
  if (!existsSync(pluginsDir)) return [];

  const entries = readdirSync(pluginsDir, { withFileTypes: true });
  const plugins = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const indexPath = join(pluginsDir, entry.name, "index.js");
    if (!existsSync(indexPath)) continue;

    try {
      const mod = await import(pathToFileURL(indexPath).href);
      const plugin = mod.default;

      if (!plugin?.name || typeof plugin.poll !== "function" || typeof plugin.init !== "function") {
        console.warn(`Skipping plugin "${entry.name}": missing required exports (name, init, poll)`);
        continue;
      }

      plugins.push(plugin);
    } catch (err) {
      console.warn(`Skipping plugin "${entry.name}": ${err.message}`);
    }
  }

  return plugins;
}
