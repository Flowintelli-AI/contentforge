// ─── Opus Clip integration interface ─────────────────────────────────────────

export interface SubmitVideoParams {
  /** Public URL of the source video (must be accessible by Opus Clip) */
  videoUrl: string;
  /** Display title for the job */
  title: string;
  /** Internal reference for webhook correlation */
  videoId: string;
  /** Target clip duration range in seconds */
  clipDuration?: { min: number; max: number };
  /** Target aspect ratio */
  aspectRatio?: "9:16" | "16:9" | "1:1";
}

export interface SubmitVideoResult {
  opusJobId: string;
  status: "queued" | "processing" | "complete" | "failed";
}

export interface Clip {
  clipId: string;
  downloadUrl: string;
  duration: number;
  thumbnailUrl?: string;
  score?: number;
}

export interface RepurposeStatus {
  opusJobId: string;
  status: "queued" | "processing" | "complete" | "failed";
  progress?: number;
  clips?: Clip[];
  errorMessage?: string;
}

export interface IOpusClipService {
  submitVideo(params: SubmitVideoParams): Promise<SubmitVideoResult>;
  getStatus(opusJobId: string): Promise<RepurposeStatus>;
  getClips(opusJobId: string): Promise<Clip[]>;
}
