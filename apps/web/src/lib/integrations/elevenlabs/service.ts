// ─── ElevenLabs service implementation ───────────────────────────────────────

import { withRetry, isRetryableHttpError } from "../shared/retry";
import { createLogger } from "../shared/logger";
import type {
  IElevenLabsService,
  Voice,
  GenerateSpeechParams,
  GenerateSpeechResult,
  CloneVoiceParams,
  CloneVoiceResult,
} from "./interface";

const logger = createLogger("elevenlabs");
const EL_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL = "eleven_monolingual_v1";

// ── Mock implementation ───────────────────────────────────────────────────────

class MockElevenLabsService implements IElevenLabsService {
  async listVoices(): Promise<Voice[]> {
    logger.info("MOCK listVoices");
    return [
      { voiceId: "mock_voice_rachel", name: "Rachel", labels: { accent: "american", gender: "female" } },
      { voiceId: "mock_voice_josh", name: "Josh", labels: { accent: "american", gender: "male" } },
    ];
  }

  async generateSpeech(params: GenerateSpeechParams): Promise<GenerateSpeechResult> {
    logger.info("MOCK generateSpeech", { voiceId: params.voiceId, scriptId: params.scriptId });
    // Return a minimal valid MP3 header encoded as base64
    return {
      audioBase64: "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA",
      mimeType: "audio/mpeg",
    };
  }

  async cloneVoice(params: CloneVoiceParams): Promise<CloneVoiceResult> {
    logger.info("MOCK cloneVoice", { name: params.name });
    return { voiceId: `mock_cloned_${Date.now()}`, name: params.name };
  }
}

// ── Live implementation ───────────────────────────────────────────────────────

class LiveElevenLabsService implements IElevenLabsService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers(extra: Record<string, string> = {}) {
    return { "xi-api-key": this.apiKey, ...extra };
  }

  async listVoices(): Promise<Voice[]> {
    return withRetry(async () => {
      const res = await fetch(`${EL_BASE}/voices`, { headers: this.headers() });
      if (!res.ok) throw Object.assign(new Error("listVoices failed"), { status: res.status });
      const data = await res.json() as { voices: Array<{ voice_id: string; name: string; preview_url?: string; labels?: Record<string, string> }> };
      return data.voices.map((v) => ({
        voiceId: v.voice_id,
        name: v.name,
        previewUrl: v.preview_url,
        labels: v.labels,
      }));
    }, { shouldRetry: isRetryableHttpError });
  }

  async generateSpeech(params: GenerateSpeechParams): Promise<GenerateSpeechResult> {
    return withRetry(
      async () => {
        const res = await fetch(`${EL_BASE}/text-to-speech/${params.voiceId}`, {
          method: "POST",
          headers: this.headers({ "Content-Type": "application/json", Accept: "audio/mpeg" }),
          body: JSON.stringify({
            text: params.text,
            model_id: params.modelId ?? DEFAULT_MODEL,
            voice_settings: {
              stability: params.stability ?? 0.5,
              similarity_boost: params.similarityBoost ?? 0.75,
            },
          }),
        });
        if (!res.ok) throw Object.assign(new Error("generateSpeech failed"), { status: res.status });
        const buffer = await res.arrayBuffer();
        const audioBase64 = Buffer.from(buffer).toString("base64");
        logger.info("Speech generated", { scriptId: params.scriptId, bytes: buffer.byteLength });
        return { audioBase64, mimeType: "audio/mpeg" };
      },
      { shouldRetry: isRetryableHttpError }
    );
  }

  async cloneVoice(params: CloneVoiceParams): Promise<CloneVoiceResult> {
    return withRetry(
      async () => {
        // Fetch all sample audio files and build a multipart form
        const form = new FormData();
        form.append("name", params.name);
        if (params.description) form.append("description", params.description);

        for (const [i, url] of Array.from(params.sampleUrls.entries())) {
          const audio = await fetch(url);
          const blob = await audio.blob();
          form.append("files", blob, `sample_${i}.mp3`);
        }

        const res = await fetch(`${EL_BASE}/voices/add`, {
          method: "POST",
          headers: this.headers(),
          body: form,
        });
        if (!res.ok) throw Object.assign(new Error("cloneVoice failed"), { status: res.status });
        const data = await res.json() as { voice_id: string };
        logger.info("Voice cloned", { voiceId: data.voice_id, name: params.name });
        return { voiceId: data.voice_id, name: params.name };
      },
      { maxAttempts: 2, shouldRetry: isRetryableHttpError }
    );
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export const elevenLabsService: IElevenLabsService = process.env.ELEVENLABS_API_KEY
  ? new LiveElevenLabsService(process.env.ELEVENLABS_API_KEY)
  : new MockElevenLabsService();
