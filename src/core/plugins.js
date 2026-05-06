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

      if (!plugin?.name || typeof plugin.run !== "function" || typeof plugin.init !== "function") {
        console.warn(`Skipping plugin "${entry.name}": missing required exports (name, init, run)`);
        continue;
      }

      plugins.push({ state: "loaded", ...plugin });
    } catch (err) {
      const pkgJsonPath = join(pluginsDir, entry.name, "package.json");
      const nodeModulesPath = join(pluginsDir, entry.name, "node_modules");
      if (existsSync(pkgJsonPath) && !existsSync(nodeModulesPath)) {
        plugins.push({ state: "uninstalled", name: entry.name });
      } else {
        console.warn(`Skipping plugin "${entry.name}": ${err.message}`);
      }
    }
  }

  plugins.sort((a, b) => a.name.localeCompare(b.name));
  return plugins;
}
