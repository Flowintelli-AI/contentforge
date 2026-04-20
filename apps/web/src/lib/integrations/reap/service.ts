// ─── Reap.video service ───────────────────────────────────────────────────────
// Handles uploading a rendered video to Reap and creating a captions project.
//
// Flow:
//   1. GET  /get-upload-url  → { uploadId, presignedUrl }
//   2. PUT  presignedUrl     ← stream video from Shotstack CDN (no buffering)
//   3. POST /create-captions → { projectId }

import { createLogger } from "../shared/logger";
import { withRetry, isRetryableHttpError } from "../shared/retry";

const logger = createLogger("reap");

const REAP_BASE = "https://public.reap.video/api/v1/automation";

export interface ReapCaptionsOptions {
  captionsPreset?: string;   // e.g. "system_beasty" (MrBeast-style)
  enableEmojis?: boolean;
  enableHighlights?: boolean;
  language?: string;         // ISO 639-1, default "en"
  selectedStart?: number;    // seconds — caption a sub-range of the video
  selectedEnd?: number;
  webhookUrl?: string;       // fires when project completes/fails
}

interface UploadUrlResponse {
  uploadId: string;
  presignedUrl: string;
}

interface CreateCaptionsResponse {
  projectId: string;
}

class ReapService {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  // Step 1 — get a presigned upload URL from Reap
  private async getUploadUrl(): Promise<UploadUrlResponse> {
    return withRetry(async () => {
      const res = await fetch(`${REAP_BASE}/get-upload-url`, {
        headers: this.headers,
      });
      if (!res.ok) throw Object.assign(new Error(`Reap get-upload-url ${res.status}`), { status: res.status });
      return res.json() as Promise<UploadUrlResponse>;
    }, { shouldRetry: isRetryableHttpError });
  }

  // Step 2 — stream the source video directly to Reap's S3 presigned URL
  private async uploadVideo(presignedUrl: string, videoUrl: string): Promise<void> {
    const sourceRes = await fetch(videoUrl);
    if (!sourceRes.ok || !sourceRes.body) {
      throw new Error(`Failed to fetch source video: ${sourceRes.status}`);
    }

    const uploadRes = await fetch(presignedUrl, {
      method: "PUT",
      // Stream directly — avoids buffering the whole file in memory
      body: sourceRes.body,
      headers: { "Content-Type": "video/mp4" },
      // @ts-expect-error — duplex required for streaming in Node.js fetch
      duplex: "half",
    });
    if (!uploadRes.ok) {
      throw new Error(`Reap presigned upload failed: ${uploadRes.status}`);
    }
  }

  // Step 3 — create the captions project
  private async createCaptions(
    uploadId: string,
    options: ReapCaptionsOptions
  ): Promise<CreateCaptionsResponse> {
    return withRetry(async () => {
      const res = await fetch(`${REAP_BASE}/create-captions`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          uploadId,
          captionsPreset: options.captionsPreset ?? "system_beasty",
          enableEmojis: options.enableEmojis ?? true,
          enableHighlights: options.enableHighlights ?? true,
          language: options.language ?? "en",
          ...(options.selectedStart != null ? { selectedStart: options.selectedStart } : {}),
          ...(options.selectedEnd != null ? { selectedEnd: options.selectedEnd } : {}),
          ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw Object.assign(new Error(`Reap create-captions ${res.status}: ${body}`), { status: res.status });
      }
      return res.json() as Promise<CreateCaptionsResponse>;
    }, { shouldRetry: isRetryableHttpError });
  }

  /**
   * Upload `videoUrl` to Reap and kick off a captions project.
   * Returns the Reap `projectId` — store this to correlate the webhook.
   */
  async submitCaptions(videoUrl: string, options: ReapCaptionsOptions = {}): Promise<string> {
    logger.info("Starting Reap captions upload", { videoUrl });

    const { uploadId, presignedUrl } = await this.getUploadUrl();
    logger.info("Got Reap upload URL", { uploadId });

    await this.uploadVideo(presignedUrl, videoUrl);
    logger.info("Video uploaded to Reap", { uploadId });

    const { projectId } = await this.createCaptions(uploadId, options);
    logger.info("Reap captions project created", { projectId });

    return projectId;
  }
}

class MockReapService {
  async submitCaptions(videoUrl: string, _options: ReapCaptionsOptions = {}): Promise<string> {
    logger.info("MOCK submitCaptions", { videoUrl });
    return `mock_reap_${Date.now()}`;
  }
}

export const reapService: { submitCaptions: (videoUrl: string, options?: ReapCaptionsOptions) => Promise<string> } =
  process.env.REAP_API_KEY
    ? new ReapService(process.env.REAP_API_KEY)
    : new MockReapService();
