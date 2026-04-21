/**
 * Test: Shotstack trim + background music
 *
 * Usage:
 *   node scripts/test-shotstack-music.mjs <SHOTSTACK_API_KEY> [mood]
 *
 * mood: motivational | educational | inspiring | energetic  (default: motivational)
 *
 * Uses a short public domain video clip and a Mixkit track to verify:
 *   1. Shotstack accepts the render with the music track
 *   2. The render completes successfully
 *   3. The output URL is accessible
 */

const [, , apiKey, mood = "motivational"] = process.argv;

if (!apiKey) {
  console.error("Usage: node scripts/test-shotstack-music.mjs <SHOTSTACK_API_KEY> [mood]");
  process.exit(1);
}

// Short public domain MP4 clip from Shotstack's own sample assets
const TEST_VIDEO_URL = "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/footage/beach.mp4";
const DURATION_SEC = 8;

// Music catalog (mirrors music-catalog.ts)
const CATALOG = {
  motivational: [
    "https://assets.mixkit.co/music/download/mixkit-inspiring-life-214.mp3",
    "https://assets.mixkit.co/music/download/mixkit-raising-me-higher-34.mp3",
  ],
  educational: [
    "https://assets.mixkit.co/music/download/mixkit-dreaming-big-31.mp3",
    "https://assets.mixkit.co/music/download/mixkit-a-very-happy-christmas-897.mp3",
  ],
  inspiring: [
    "https://assets.mixkit.co/music/download/mixkit-serene-view-443.mp3",
    "https://assets.mixkit.co/music/download/mixkit-life-is-a-dream-837.mp3",
  ],
  energetic: [
    "https://assets.mixkit.co/music/download/mixkit-tech-house-vibes-130.mp3",
    "https://assets.mixkit.co/music/download/mixkit-hip-hop-02-738.mp3",
  ],
};

const bucket = CATALOG[mood] ?? CATALOG.motivational;
const musicUrl = bucket[Math.floor(Math.random() * bucket.length)];

console.log(`\n🎵 Mood: ${mood}`);
console.log(`🎶 Track: ${musicUrl}`);
console.log(`🎬 Video: ${TEST_VIDEO_URL}`);
console.log(`⏱  Duration: ${DURATION_SEC}s\n`);

// ── Step 1: Submit render ────────────────────────────────────────────────────

const edit = {
  timeline: {
    tracks: [
      {
        clips: [
          {
            asset: { type: "video", src: TEST_VIDEO_URL, trim: 0, volume: 1.0 },
            start: 0,
            length: DURATION_SEC,
            fit: "cover",
          },
        ],
      },
      {
        clips: [
          {
            asset: { type: "audio", src: musicUrl, trim: 0, volume: 0.15, effect: "fadeOut" },
            start: 0,
            length: DURATION_SEC,
          },
        ],
      },
    ],
  },
  output: {
    format: "mp4",
    size: { width: 1080, height: 1920 },
    fps: 30,
    quality: "medium",
  },
};

const submitRes = await fetch("https://api.shotstack.io/stage/render", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": apiKey },
  body: JSON.stringify(edit),
});

if (!submitRes.ok) {
  const errText = await submitRes.text();
  console.error(`❌ Shotstack submit failed ${submitRes.status}: ${errText}`);
  process.exit(1);
}

const submitData = await submitRes.json();
const renderId = submitData.response?.id;
if (!renderId) {
  console.error("❌ No render ID in response:", JSON.stringify(submitData));
  process.exit(1);
}

console.log(`✅ Render submitted: ${renderId}`);
console.log("⏳ Polling for completion (up to 3 min)...\n");

// ── Step 2: Poll until done ──────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 36; // 3 minutes

for (let i = 0; i < MAX_POLLS; i++) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

  const pollRes = await fetch(`https://api.shotstack.io/stage/render/${renderId}`, {
    headers: { "x-api-key": apiKey },
  });

  if (!pollRes.ok) {
    console.warn(`  Poll ${i + 1}: HTTP ${pollRes.status} — retrying...`);
    continue;
  }

  const pollData = await pollRes.json();
  const status = pollData.response?.status;
  const url = pollData.response?.url;

  console.log(`  Poll ${i + 1}: status=${status}`);

  if (status === "done") {
    console.log(`\n✅ Render complete!`);
    console.log(`🔗 Output URL: ${url}`);

    // Verify URL is accessible
    const headRes = await fetch(url, { method: "HEAD" });
    if (headRes.ok) {
      const mb = Math.round(parseInt(headRes.headers.get("content-length") ?? "0") / 1024 / 1024 * 10) / 10;
      console.log(`✅ URL accessible — ${mb} MB`);
    } else {
      console.warn(`⚠️  URL returned ${headRes.status} — may still be propagating`);
    }
    process.exit(0);
  }

  if (status === "failed") {
    console.error(`\n❌ Render FAILED`);
    console.error(JSON.stringify(pollData.response, null, 2));
    process.exit(1);
  }
}

console.error("❌ Timed out waiting for render");
process.exit(1);
