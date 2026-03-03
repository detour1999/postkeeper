#!/usr/bin/env node
// scripts/migrate-from-instapost.js
//
// Migrates existing instapost output/ to postkeeper archive/instagram/ format.
// - Reads each .json post file from output/posts/<username>/
// - Writes .as2.json (converted) and .raw.json (the original json as raw)
// - Copies media directories as-is
//
// Usage: node scripts/migrate-from-instapost.js [--dry-run]

import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { toAS2 } from "../plugins/instagram/as2.js";

const dryRun = process.argv.includes("--dry-run");
const sourceDir = "output/posts";
const targetDir = "archive/instagram/posts";

if (!existsSync(sourceDir)) {
  console.log("No output/posts directory found. Nothing to migrate.");
  process.exit(0);
}

const usernames = readdirSync(sourceDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let totalPosts = 0;

for (const username of usernames) {
  const userSourceDir = join(sourceDir, username);
  const userTargetDir = join(targetDir, username);

  const jsonFiles = readdirSync(userSourceDir).filter((f) => f.endsWith(".json"));

  for (const jsonFile of jsonFiles) {
    const baseName = jsonFile.replace(".json", "");
    const post = JSON.parse(readFileSync(join(userSourceDir, jsonFile), "utf-8"));

    if (dryRun) {
      console.log(`Would migrate: ${username}/${jsonFile}`);
      totalPosts++;
      continue;
    }

    mkdirSync(userTargetDir, { recursive: true });

    // Write AS2
    const as2 = toAS2(post, "instagram");
    writeFileSync(join(userTargetDir, `${baseName}.as2.json`), JSON.stringify(as2, null, 2));

    // Write raw (the old json IS the raw data)
    writeFileSync(join(userTargetDir, `${baseName}.raw.json`), JSON.stringify(post, null, 2));

    // Copy media directory if it exists
    const mediaSourceDir = join(userSourceDir, baseName);
    if (existsSync(mediaSourceDir)) {
      const mediaTargetDir = join(userTargetDir, baseName);
      cpSync(mediaSourceDir, mediaTargetDir, { recursive: true });
    }

    totalPosts++;
  }

  if (!dryRun) {
    console.log(`Migrated ${jsonFiles.length} post(s) for @${username}`);
  }
}

console.log(`\n${dryRun ? "Would migrate" : "Migrated"} ${totalPosts} total post(s).`);
