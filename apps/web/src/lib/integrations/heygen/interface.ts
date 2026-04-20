// ─── HeyGen integration interface ────────────────────────────────────────────

export interface Avatar {
  avatarId: string;
  name: string;
  previewUrl?: string;
}

export interface GenerateAvatarVideoParams {
  avatarId: string;
  voiceId: string;
  script: string;
  /** Internal reference for webhook correlation */
  scriptId: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  backgroundUrl?: string;
}

export interface GenerateAvatarVideoResult {
  heygenVideoId: string;
  status: "pending" | "processing" | "completed" | "failed";
}

export interface AvatarVideoStatus {
  heygenVideoId: string;
  status: "pending" | "processing" | "completed" | "failed";
  downloadUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  errorMessage?: string;
}

// ─── Lipsync types ────────────────────────────────────────────────────────────

export interface LipsyncParams {
  /** URL of the face video (original creator footage) */
  faceVideoUrl: string;
  /** URL of the cloned voice audio (from ElevenLabs) */
  audioUrl: string;
  /** Optional display title for the job */
  title?: string;
  /** Webhook URL for completion notification */
  callbackUrl?: string;
}

export interface LipsyncResult {
  lipsyncId: string;
  status: "pending" | "processing";
}

export interface LipsyncStatus {
  lipsyncId: string;
  status: "pending" | "processing" | "completed" | "failed";
  downloadUrl?: string;
  errorMessage?: string;
}

// ─── Service interface ────────────────────────────────────────────────────────

export interface IHeyGenService {
  listAvatars(): Promise<Avatar[]>;
  generateAvatarVideo(params: GenerateAvatarVideoParams): Promise<GenerateAvatarVideoResult>;
  getVideoStatus(heygenVideoId: string): Promise<AvatarVideoStatus>;
  /** Submit a lipsync job — replaces creator lips to match cloned audio */
  submitLipsync(params: LipsyncParams): Promise<LipsyncResult>;
  /** Poll lipsync job status (use webhook instead when possible) */
  getLipsyncStatus(lipsyncId: string): Promise<LipsyncStatus>;
}

