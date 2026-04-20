/**
 * Curated royalty-free background music per content mood.
 * All tracks from Mixkit (https://mixkit.co/free-stock-music/) — free for commercial use.
 * Volume is mixed at 15% under the creator's voice.
 *
 * To add/replace tracks: upload MP3s to R2 and add the public URL to the array.
 * The picker selects randomly within the mood bucket for variety.
 */

export type ContentMood = "motivational" | "educational" | "inspiring" | "energetic";

const CATALOG: Record<ContentMood, string[]> = {
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

/** Returns a random track URL for the given mood (falls back to motivational). */
export function pickMusicTrack(mood?: string | null): string {
  const bucket = CATALOG[(mood as ContentMood) ?? "motivational"] ?? CATALOG.motivational;
  return bucket[Math.floor(Math.random() * bucket.length)]!;
}
