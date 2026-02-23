import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export async function login() {
  let profileDir = "./.browser-profile";
  try {
    const raw = readFileSync("config.json", "utf-8");
    const config = JSON.parse(raw);
    if (config.profile_dir) {
      profileDir = config.profile_dir;
    }
  } catch {
    // Fall back to default profile dir if config.json is missing or invalid
  }

  profileDir = resolve(profileDir);

  console.log("Opening browser for Instagram login...");
  console.log(`Browser profile will be saved to: ${profileDir}`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://www.instagram.com/");

  console.log("Log in to Instagram in the browser window.");
  console.log("When you're done, close the browser window.");

  await new Promise((resolve) => {
    context.on("close", resolve);
  });

  console.log("Session saved. You can now run: instapost poll");
}
