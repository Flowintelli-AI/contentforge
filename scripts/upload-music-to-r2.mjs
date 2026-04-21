/**
 * Downloads Mixkit tracks and uploads them to R2 under music/ prefix.
 * Run once — prints the R2 public URLs to paste into music-catalog.ts
 *
 * Usage:
 *   node scripts/upload-music-to-r2.mjs
 */

/**
 * Uploads local MP3 files to R2 under music/ prefix.
 *
 * 1. Download each track from Mixkit in your browser (links below)
 * 2. Place all MP3s in scripts/music-tracks/
 * 3. Run: node scripts/upload-music-to-r2.mjs
 *
 * Mixkit download links (free, commercial use):
 *   https://assets.mixkit.co/music/download/mixkit-inspiring-life-214.mp3
 *   https://assets.mixkit.co/music/download/mixkit-raising-me-higher-34.mp3
 *   https://assets.mixkit.co/music/download/mixkit-dreaming-big-31.mp3
 *   https://assets.mixkit.co/music/download/mixkit-just-kidding-592.mp3
 *   https://assets.mixkit.co/music/download/mixkit-serene-view-443.mp3
 *   https://assets.mixkit.co/music/download/mixkit-life-is-a-dream-837.mp3
 *   https://assets.mixkit.co/music/download/mixkit-tech-house-vibes-130.mp3
 *   https://assets.mixkit.co/music/download/mixkit-hip-hop-02-738.mp3
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "../scripts-deps/package.json"));
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const ACCOUNT_ID   = "d78ef7f6da178c5054297cb34a2f8f11";
const ACCESS_KEY   = "8edb4716226cac1c44b4cb5673544166";
const SECRET_KEY   = "d3e17dddc3b79198b4136539bb50a0b95070eb7d28131d45f330b73748de9af7";
const PUBLIC_URL   = "https://pub-c78be656b69b437098171782a0d1418b.r2.dev";
const BUCKET       = "contentforge-videos";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

const TRACKS_DIR = join(__dirname, "music-tracks");

let files;
try {
  files = readdirSync(TRACKS_DIR).filter(f => f.endsWith(".mp3"));
} catch {
  console.error(`❌ Folder not found: ${TRACKS_DIR}`);
  console.error("Create scripts/music-tracks/ and drop the MP3 files there.");
  process.exit(1);
}

if (files.length === 0) {
  console.error("❌ No MP3 files found in scripts/music-tracks/");
  process.exit(1);
}

console.log(`\nFound ${files.length} tracks to upload:\n`);

const uploaded = [];

for (const file of files) {
  const filePath = join(TRACKS_DIR, file);
  const key = `music/${file}`;
  const buffer = readFileSync(filePath);
  const kb = Math.round(buffer.byteLength / 1024);

  process.stdout.write(`⬆  ${file} (${kb} KB)...`);

  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: "audio/mpeg",
    CacheControl: "public, max-age=31536000",
  }));

  const publicUrl = `${PUBLIC_URL}/${key}`;
  console.log(` ✅`);
  uploaded.push({ file, publicUrl });
}

console.log("\n\n── R2 Public URLs (add to music-catalog.ts) ────────────────────────────");
for (const { file, publicUrl } of uploaded) {
  console.log(`  "${publicUrl}", // ${file}`);
}

