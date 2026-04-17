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

export interface IHeyGenService {
  listAvatars(): Promise<Avatar[]>;
  generateAvatarVideo(params: GenerateAvatarVideoParams): Promise<GenerateAvatarVideoResult>;
  getVideoStatus(heygenVideoId: string): Promise<AvatarVideoStatus>;
}
