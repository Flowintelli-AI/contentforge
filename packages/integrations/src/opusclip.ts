// Opus Clip API wrapper
// Upload a video URL → get back short clips

const OPUS_BASE = "https://api.opus.pro/v1";
const OPUS_API_KEY = process.env.OPUS_CLIP_API_KEY ?? "";

interface OpusClipJobRequest {
  videoUrl: string;        // publicly accessible URL
  targetDurations?: number[]; // seconds e.g. [30, 60]
  numClips?: number;
  language?: string;
}

interface OpusClipJob {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  clips?: OpusClip[];
  error?: string;
}

interface OpusClip {
  id: string;
  url: string;
  duration: number;
  startTime: number;
  endTime: number;
  score: number;          // virality score 0-100
  captions?: string;
}

async function opusFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${OPUS_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": OPUS_API_KEY,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpusClip error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function createClipJob(request: OpusClipJobRequest): Promise<OpusClipJob> {
  return opusFetch<OpusClipJob>("/clips", {
    method: "POST",
    body: JSON.stringify({
      video_url: request.videoUrl,
      num_clips: request.numClips ?? 5,
      target_durations: request.targetDurations ?? [30, 60],
      language: request.language ?? "en",
    }),
  });
}

export async function getClipJob(jobId: string): Promise<OpusClipJob> {
  return opusFetch<OpusClipJob>(`/clips/${jobId}`);
}

// ── Poll job until complete (with timeout) ────────────────────────────────────

export async function pollClipJob(
  jobId: string,
  { maxMinutes = 15, intervalMs = 15_000 } = {}
): Promise<OpusClipJob> {
  const deadline = Date.now() + maxMinutes * 60 * 1000;

  while (Date.now() < deadline) {
    const job = await getClipJob(jobId);
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`OpusClip job ${jobId} timed out after ${maxMinutes}m`);
}
