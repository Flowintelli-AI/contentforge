import axios from "axios";

const BASE_URL = "https://api.elevenlabs.io/v1";
const API_KEY = process.env.ELEVENLABS_API_KEY ?? "";

const client = axios.create({
  baseURL: BASE_URL,
  headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
});

export interface VoiceCloneOptions {
  name: string;
  description?: string;
  audioFilePaths: string[];
}

export interface TextToSpeechOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

export async function listVoices(): Promise<{ voiceId: string; name: string }[]> {
  if (!API_KEY) return [];
  const res = await client.get("/voices");
  return (res.data.voices ?? []).map((v: any) => ({ voiceId: v.voice_id, name: v.name }));
}

export async function textToSpeech(options: TextToSpeechOptions): Promise<Buffer> {
  if (!API_KEY) {
    // Return empty buffer as mock
    return Buffer.from("");
  }

  const res = await client.post(
    `/text-to-speech/${options.voiceId}`,
    {
      text: options.text,
      model_id: options.modelId ?? "eleven_multilingual_v2",
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
      },
    },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(res.data);
}

export async function cloneVoice(options: VoiceCloneOptions): Promise<{ voiceId: string }> {
  if (!API_KEY) {
    return { voiceId: `mock-voice-${Date.now()}` };
  }

  const FormData = require("form-data");
  const fs = require("fs");
  const form = new FormData();
  form.append("name", options.name);
  if (options.description) form.append("description", options.description);
  for (const filePath of options.audioFilePaths) {
    form.append("files", fs.createReadStream(filePath));
  }

  const res = await client.post("/voices/add", form, {
    headers: form.getHeaders(),
  });

  return { voiceId: res.data.voice_id };
}
