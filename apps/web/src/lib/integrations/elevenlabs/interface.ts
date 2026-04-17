// ─── ElevenLabs integration interface ────────────────────────────────────────

export interface Voice {
  voiceId: string;
  name: string;
  previewUrl?: string;
  labels?: Record<string, string>;
}

export interface GenerateSpeechParams {
  voiceId: string;
  text: string;
  /** Internal reference for storage/naming */
  scriptId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

export interface GenerateSpeechResult {
  /** Base64-encoded MP3 audio data */
  audioBase64: string;
  /** Mime type, always audio/mpeg */
  mimeType: "audio/mpeg";
}

export interface CloneVoiceParams {
  name: string;
  description?: string;
  /** Array of public audio sample URLs (min 1, max 25) */
  sampleUrls: string[];
}

export interface CloneVoiceResult {
  voiceId: string;
  name: string;
}

export interface IElevenLabsService {
  listVoices(): Promise<Voice[]>;
  generateSpeech(params: GenerateSpeechParams): Promise<GenerateSpeechResult>;
  cloneVoice(params: CloneVoiceParams): Promise<CloneVoiceResult>;
}
