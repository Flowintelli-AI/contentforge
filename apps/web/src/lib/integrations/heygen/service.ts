// ─── HeyGen service implementation ───────────────────────────────────────────

import { withRetry, isRetryableHttpError } from "../shared/retry";
import { createLogger } from "../shared/logger";
import type {
  IHeyGenService,
  Avatar,
  GenerateAvatarVideoParams,
  GenerateAvatarVideoResult,
  AvatarVideoStatus,
} from "./interface";

const logger = createLogger("heygen");
const HEYGEN_BASE = "https://api.heygen.com";

// ── Mock implementation ───────────────────────────────────────────────────────

class MockHeyGenService implements IHeyGenService {
  private videos = new Map<string, AvatarVideoStatus>();

  async listAvatars(): Promise<Avatar[]> {
    logger.info("MOCK listAvatars");
    return [
      { avatarId: "mock_avatar_1", name: "Alex (Professional)", previewUrl: "https://example.com/alex.jpg" },
      { avatarId: "mock_avatar_2", name: "Jordan (Casual)", previewUrl: "https://example.com/jordan.jpg" },
    ];
  }

  async generateAvatarVideo(params: GenerateAvatarVideoParams): Promise<GenerateAvatarVideoResult> {
    logger.info("MOCK generateAvatarVideo", { scriptId: params.scriptId });
    const id = `mock_heygen_${Date.now()}`;
    this.videos.set(id, { heygenVideoId: id, status: "processing" });
    setTimeout(() => {
      this.videos.set(id, {
        heygenVideoId: id,
        status: "completed",
        downloadUrl: "https://example.com/mock-avatar-video.mp4",
        thumbnailUrl: "https://example.com/mock-avatar-thumb.jpg",
        duration: 60,
      });
    }, 5000);
    return { heygenVideoId: id, status: "processing" };
  }

  async getVideoStatus(heygenVideoId: string): Promise<AvatarVideoStatus> {
    return this.videos.get(heygenVideoId) ?? { heygenVideoId, status: "pending" };
  }
}

// ── Live implementation ───────────────────────────────────────────────────────

class LiveHeyGenService implements IHeyGenService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${HEYGEN_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`HeyGen ${init.method ?? "GET"} ${path} → ${res.status}: ${body}`);
      (err as any).status = res.status;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  async listAvatars(): Promise<Avatar[]> {
    return withRetry(async () => {
      const data = await this.request<{ data: { avatars: Array<{ avatar_id: string; avatar_name: string; preview_image_url?: string }> } }>("/v2/avatars");
      return data.data.avatars.map((a) => ({
        avatarId: a.avatar_id,
        name: a.avatar_name,
        previewUrl: a.preview_image_url,
      }));
    }, { shouldRetry: isRetryableHttpError });
  }

  async generateAvatarVideo(params: GenerateAvatarVideoParams): Promise<GenerateAvatarVideoResult> {
    return withRetry(
      async () => {
        const data = await this.request<{ data: { video_id: string } }>("/v2/video/generate", {
          method: "POST",
          body: JSON.stringify({
            video_inputs: [
              {
                character: { type: "avatar", avatar_id: params.avatarId },
                voice: { type: "text", input_text: params.script, voice_id: params.voiceId },
              },
            ],
            aspect_ratio: params.aspectRatio ?? "9:16",
            test: process.env.NODE_ENV !== "production",
            caption: false,
          }),
        });
        logger.info("HeyGen video job created", { heygenVideoId: data.data.video_id });
        return { heygenVideoId: data.data.video_id, status: "processing" };
      },
      { shouldRetry: isRetryableHttpError }
    );
  }

  async getVideoStatus(heygenVideoId: string): Promise<AvatarVideoStatus> {
    return withRetry(async () => {
      const data = await this.request<{
        data: {
          video_id: string;
          status: string;
          video_url?: string;
          thumbnail_url?: string;
          duration?: number;
          error?: string;
        };
      }>(`/v1/video_status.get?video_id=${heygenVideoId}`);

      const d = data.data;
      return {
        heygenVideoId: d.video_id,
        status: d.status as AvatarVideoStatus["status"],
        downloadUrl: d.video_url,
        thumbnailUrl: d.thumbnail_url,
        duration: d.duration,
        errorMessage: d.error,
      };
    }, { shouldRetry: isRetryableHttpError });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export const heyGenService: IHeyGenService = process.env.HEYGEN_API_KEY
  ? new LiveHeyGenService(process.env.HEYGEN_API_KEY)
  : new MockHeyGenService();
