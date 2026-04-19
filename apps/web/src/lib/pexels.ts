// Pexels B-roll search — returns portrait video clips that cover a target duration

const PEXELS_BASE = "https://api.pexels.com/videos";

export interface PexelsBrollClip {
  /** Direct video file URL (SD quality, portrait preferred) */
  url: string;
  duration: number; // seconds
}

interface PexelsVideoFile {
  link: string;
  quality: string;
  width: number;
  height: number;
}

interface PexelsVideo {
  duration: number;
  video_files: PexelsVideoFile[];
}

interface PexelsSearchResponse {
  videos: PexelsVideo[];
}

function bestFile(files: PexelsVideoFile[]): PexelsVideoFile | undefined {
  // Prefer portrait SD (width < height). Fall back to any SD, then any file.
  const portrait = files.filter((f) => f.height > f.width);
  const sd = portrait.filter((f) => f.quality === "sd");
  return sd[0] ?? portrait[0] ?? files.find((f) => f.quality === "sd") ?? files[0];
}

async function searchPexels(query: string, perPage = 10): Promise<PexelsVideo[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn("[pexels] PEXELS_API_KEY not set — returning empty B-roll");
    return [];
  }

  const url = new URL(`${PEXELS_BASE}/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("min_duration", "4");
  url.searchParams.set("max_duration", "60");

  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey }, // Pexels uses bare key, not Bearer
  });

  if (!res.ok) {
    console.error(`[pexels] search failed: ${res.status} ${await res.text()}`);
    return [];
  }

  const data = (await res.json()) as PexelsSearchResponse;
  return data.videos ?? [];
}

/**
 * Search Pexels for B-roll clips that together cover `targetDurationSec`.
 * Falls back to a generic lifestyle query if the specific query returns nothing.
 */
export async function searchBroll(
  query: string,
  targetDurationSec: number
): Promise<PexelsBrollClip[]> {
  let videos = await searchPexels(query, 12);

  if (videos.length === 0) {
    console.log(`[pexels] no results for "${query}", falling back to generic query`);
    videos = await searchPexels("business creator lifestyle motivation", 12);
  }

  const clips: PexelsBrollClip[] = [];
  let accumulated = 0;

  for (const video of videos) {
    if (accumulated >= targetDurationSec) break;
    const file = bestFile(video.video_files);
    if (!file) continue;

    clips.push({ url: file.link, duration: video.duration });
    accumulated += video.duration;
  }

  console.log(
    `[pexels] query="${query}" clips=${clips.length} coverage=${accumulated.toFixed(1)}s target=${targetDurationSec}s`
  );

  return clips;
}
