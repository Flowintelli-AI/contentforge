/**
 * Standalone Reap integration test.
 * Usage: node scripts/test-reap.mjs <REAP_API_KEY> [videoUrl]
 *
 * Tests: get-upload-url → upload video → create-captions
 * Does NOT touch HeyGen, ElevenLabs, or Shotstack.
 */

const REAP_BASE = "https://public.reap.video/api/v1/automation";

const apiKey = process.argv[2];
// Use a short public MP4 if no custom URL provided
const videoUrl = process.argv[3] ?? "https://resource2.heygen.ai/video_translate/e64b280ef569492694a6b429b20440a4/original.mp4";

if (!apiKey) {
  console.error("Usage: node scripts/test-reap.mjs <REAP_API_KEY> [videoUrl]");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

function log(step, data) {
  console.log(`\n[${step}]`, JSON.stringify(data, null, 2));
}

// ── Step 1: get-upload-url ────────────────────────────────────────────────────
console.log("\n=== Step 1: get-upload-url ===");
const uploadUrlRes = await fetch(`${REAP_BASE}/get-upload-url`, {
  method: "POST",
  headers,
  body: JSON.stringify({ filename: "clip.mp4" }),
});
const uploadUrlBody = await uploadUrlRes.json();
log("Response", { status: uploadUrlRes.status, body: uploadUrlBody });

if (!uploadUrlRes.ok) {
  console.error("❌ get-upload-url failed");
  process.exit(1);
}
const { id: uploadId, uploadUrl } = uploadUrlBody;
console.log(`✅ uploadId=${uploadId}`);

// ── Step 2: upload video ──────────────────────────────────────────────────────
console.log(`\n=== Step 2: upload video from ${videoUrl} ===`);
const sourceRes = await fetch(videoUrl);
if (!sourceRes.ok) {
  console.error(`❌ Could not fetch source video: ${sourceRes.status}`);
  process.exit(1);
}
// Buffer required — S3 presigned URLs need Content-Length (no chunked transfer)
const buffer = Buffer.from(await sourceRes.arrayBuffer());
console.log(`   Downloaded ${(buffer.byteLength / 1024).toFixed(0)} KB`);

const uploadRes = await fetch(uploadUrl, {
  method: "PUT",
  body: buffer,
  headers: {
    "Content-Type": "video/mp4",
    "Content-Length": String(buffer.byteLength),
  },
});
log("Upload response", { status: uploadRes.status });
if (!uploadRes.ok) {
  const body = await uploadRes.text();
  console.error("❌ Upload failed:", body);
  process.exit(1);
}
console.log("✅ Video uploaded to Reap");

// ── Step 3: create-captions ───────────────────────────────────────────────────
console.log("\n=== Step 3: create-captions ===");
const captionsRes = await fetch(`${REAP_BASE}/create-captions`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    uploadId,
    captionsPreset: "karaoke-bold",
    enableEmojis: true,
    enableHighlights: true,
    language: "en",
  }),
});
const captionsBody = await captionsRes.json();
log("Response", { status: captionsRes.status, body: captionsBody });

if (!captionsRes.ok) {
  console.error("❌ create-captions failed");
  process.exit(1);
}
const { projectId } = captionsBody;
console.log(`\n✅ Reap captions project created: projectId=${projectId}`);
console.log(`🔗 Check: https://app.reap.video`);
