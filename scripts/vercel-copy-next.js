#!/usr/bin/env node
// Copies apps/web/.next to .next at repo root so Vercel can find the output.
// Vercel always checks <repo-root>/.next regardless of Turborepo root-shift.
// Runs only when VERCEL=1 (set automatically by Vercel's build environment).
const { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

if (!process.env.VERCEL) process.exit(0);

const src = join(__dirname, "..", "apps", "web", ".next");
const dest = join(__dirname, "..", ".next");

if (!existsSync(src)) {
  console.error(`vercel-copy-next: source not found: ${src}`);
  process.exit(1);
}

cpSync(src, dest, { recursive: true });
console.log("vercel-copy-next: copied apps/web/.next → .next ✓");

// Fix .nft.json relative paths.
// When the .next dir was at apps/web/.next, relative paths in .nft.json files
// went up 2 extra levels to reach the repo root (e.g. ../../node_modules/...).
// Now that .next sits at the repo root, those paths go 2 levels too high.
// We remove exactly 2 leading "../" segments from any path that overshot.
function fixNftFiles(dir, depth) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      fixNftFiles(fullPath, depth + 1);
    } else if (entry.name.endsWith(".nft.json")) {
      let data;
      try { data = JSON.parse(readFileSync(fullPath, "utf8")); } catch { continue; }
      if (!Array.isArray(data.files)) continue;
      let changed = false;
      data.files = data.files.map((p) => {
        let dots = 0;
        let rest = p;
        while (rest.startsWith("../")) { dots++; rest = rest.slice(3); }
        if (dots > depth && dots >= 2) {
          changed = true;
          return "../".repeat(dots - 2) + rest;
        }
        return p;
      });
      if (changed) writeFileSync(fullPath, JSON.stringify(data));
    }
  }
}

fixNftFiles(dest, 0);
console.log("vercel-copy-next: rewrote .nft.json paths ✓");
