// ─── Opus Clip service implementation ────────────────────────────────────────

import { withRetry, isRetryableHttpError } from "../shared/retry";
import { createLogger } from "../shared/logger";
import type {
  IOpusClipService,
  SubmitVideoParams,
  SubmitVideoResult,
  RepurposeStatus,
  Clip,
} from "./interface";

const logger = createLogger("opusclip");
const OPUS_BASE = "https://www.opus.pro/api";

// ── Mock implementation ───────────────────────────────────────────────────────

class MockOpusClipService implements IOpusClipService {
  private jobs = new Map<string, RepurposeStatus>();

  async submitVideo(params: SubmitVideoParams): Promise<SubmitVideoResult> {
    logger.info("MOCK submitVideo", { title: params.title, videoId: params.videoId });
    const id = `mock_opus_${Date.now()}`;
    this.jobs.set(id, { opusJobId: id, status: "processing", progress: 10 });
    // Simulate completion after 3 seconds in mock
    setTimeout(() => {
      this.jobs.set(id, {
        opusJobId: id,
        status: "complete",
        progress: 100,
        clips: [
          {
            clipId: `${id}_clip_1`,
            downloadUrl: "https://example.com/mock-clip-1.mp4",
            duration: 45,
            thumbnailUrl: "https://example.com/mock-thumb-1.jpg",
            score: 0.92,
          },
          {
            clipId: `${id}_clip_2`,
            downloadUrl: "https://example.com/mock-clip-2.mp4",
            duration: 30,
            thumbnailUrl: "https://example.com/mock-thumb-2.jpg",
            score: 0.85,
          },
        ],
      });
    }, 3000);
    return { opusJobId: id, status: "processing" };
  }

  async getStatus(opusJobId: string): Promise<RepurposeStatus> {
    return (
      this.jobs.get(opusJobId) ?? {
        opusJobId,
        status: "queued",
      }
    );
  }

  async getClips(opusJobId: string): Promise<Clip[]> {
    return this.jobs.get(opusJobId)?.clips ?? [];
  }
}

// ── Live implementation ───────────────────────────────────────────────────────

class LiveOpusClipService implements IOpusClipService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${OPUS_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const err = new Error(`OpusClip ${init.method ?? "GET"} ${path} → ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  async submitVideo(params: SubmitVideoParams): Promise<SubmitVideoResult> {
    return withRetry(
      async () => {
        const data = await this.request<{ id: string; status: string }>("/create", {
          method: "POST",
          body: JSON.stringify({
            url: params.videoUrl,
            title: params.title,
            aspect_ratio: params.aspectRatio ?? "9:16",
            clip_duration: params.clipDuration ?? { min: 30, max: 90 },
            webhook_metadata: { videoId: params.videoId },
          }),
        });
        logger.info("Video submitted to Opus Clip", { opusJobId: data.id });
        return { opusJobId: data.id, status: data.status as SubmitVideoResult["status"] };
      },
      { shouldRetry: isRetryableHttpError }
    );
  }

  async getStatus(opusJobId: string): Promise<RepurposeStatus> {
    return withRetry(async () => {
      const data = await this.request<{
        id: string;
        status: string;
        progress?: number;
        clips?: Array<{
          id: string;
          download_url: string;
          duration: number;
          thumbnail_url?: string;
          score?: number;
        }>;
        error?: string;
      }>(`/videos/${opusJobId}`);

      return {
        opusJobId: data.id,
        status: data.status as RepurposeStatus["status"],
        progress: data.progress,
        clips: data.clips?.map((c) => ({
          clipId: c.id,
          downloadUrl: c.download_url,
          duration: c.duration,
          thumbnailUrl: c.thumbnail_url,
          score: c.score,
        })),
        errorMessage: data.error,
      };
    }, { shouldRetry: isRetryableHttpError });
  }

  async getClips(opusJobId: string): Promise<Clip[]> {
    const status = await this.getStatus(opusJobId);
    return status.clips ?? [];
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export const opusClipService: IOpusClipService = process.env.OPUS_CLIP_API_KEY
  ? new LiveOpusClipService(process.env.OPUS_CLIP_API_KEY)
  : new MockOpusClipService();
