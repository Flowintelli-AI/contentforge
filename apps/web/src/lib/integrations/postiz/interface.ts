// ─── Postiz integration interface ────────────────────────────────────────────

export type SocialPlatform =
  | "TIKTOK"
  | "INSTAGRAM"
  | "YOUTUBE"
  | "TWITTER"
  | "LINKEDIN"
  | "FACEBOOK";

export interface SchedulePostParams {
  platform: SocialPlatform;
  content: string;
  mediaUrls?: string[];
  scheduledFor: Date;
  /** Postiz account/profile ID for this platform */
  postizProfileId: string;
  /** Internal reference for webhook correlation */
  calendarItemId: string;
}

export interface SchedulePostResult {
  postizPostId: string;
  status: "scheduled" | "published" | "failed";
}

export interface PostStatus {
  postizPostId: string;
  status: "scheduled" | "published" | "failed";
  publishedAt?: Date;
  errorMessage?: string;
}

export interface IPostizService {
  schedulePost(params: SchedulePostParams): Promise<SchedulePostResult>;
  cancelPost(postizPostId: string): Promise<void>;
  getPostStatus(postizPostId: string): Promise<PostStatus>;
}
