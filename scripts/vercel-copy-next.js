#!/usr/bin/env node
// Copies apps/web/.next to .next at repo root so Vercel can find the output.
// Vercel always checks <repo-root>/.next regardless of Turborepo root-shift.
// Runs only when VERCEL=1 (set automatically by Vercel's build environment).
const { cpSync, existsSync } = require("fs");
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
