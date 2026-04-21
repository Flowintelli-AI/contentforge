/**
 * Test script: Pixabay Music API — verifies all 4 moods return valid MP3 URLs
 * Usage: $env:PIXABAY_API_KEY="your-key" ; node scripts/test-pixabay-music.mjs
 */

const PIXABAY_MUSIC_BASE = "https://pixabay.com/api/music/";

const MOOD_MAP = {
  motivational: { category: "corporate",  q: "motivational upbeat inspiring" },
  educational:  { category: "ambient",    q: "calm focus background study" },
  inspiring:    { category: "cinematic",  q: "inspiring uplifting emotional" },
  energetic:    { category: "electronic", q: "energetic upbeat driving" },
};

const apiKey = process.env.PIXABAY_API_KEY;
if (!apiKey) {
  console.error("❌ PIXABAY_API_KEY env var not set");
  console.error("   Run: $env:PIXABAY_API_KEY='your-key' ; node scripts/test-pixabay-music.mjs");
  process.exit(1);
}

async function testMood(mood, { category, q }) {
  const params = new URLSearchParams({ key: apiKey, category, q, per_page: "10", order: "popular" });
  const res = await fetch(`${PIXABAY_MUSIC_BASE}?${params}`);

  if (!res.ok) {
    console.log(`❌ ${mood}: HTTP ${res.status}`);
    return;
  }

  const data = await res.json();
  const hits = data.hits?.filter(h => h.audio && h.duration >= 10) ?? [];

  if (!hits.length) {
    console.log(`⚠️  ${mood}: 0 tracks returned`);
    return;
  }

  const pick = hits[Math.floor(Math.random() * hits.length)];
  console.log(`✅ ${mood.padEnd(13)} → "${pick.name}" (${pick.duration}s)`);
  console.log(`   URL: ${pick.audio}`);

  // Verify URL is reachable
  const headRes = await fetch(pick.audio, { method: "HEAD" });
  console.log(`   Reachable: ${headRes.ok ? "✅ " + headRes.status : "❌ " + headRes.status}`);
}

console.log("Testing Pixabay Music API for all moods...\n");
for (const [mood, params] of Object.entries(MOOD_MAP)) {
  await testMood(mood, params);
  console.log();
}
console.log("Done.");
