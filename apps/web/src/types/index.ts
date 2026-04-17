export type Platform =
  | "TIKTOK"
  | "INSTAGRAM"
  | "YOUTUBE"
  | "TWITTER"
  | "LINKEDIN";

export type IdeaStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_PROGRESS"
  | "SCRIPTED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "ARCHIVED";

export type ScriptStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REVISION_REQUESTED"
  | "PUBLISHED";

export type ReviewStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "REVISION_REQUESTED";

export type SubscriptionTier = "FREE" | "BASIC" | "GROWTH" | "PREMIUM";

export type ContentPillarType =
  | "EDUCATION"
  | "ENTERTAINMENT"
  | "INSPIRATION"
  | "PROMOTION"
  | "STORYTELLING";

export interface ScriptSection {
  hook: string;
  painPoint: string;
  authority: string;
  solution: string;
  cta: string;
}

export interface PlatformVariant {
  platform: Platform;
  script: string;
  wordCount: number;
  estimatedDuration: string;
  hashtags: string[];
  postCopy: string;
}

export interface GeneratedScript {
  title: string;
  niche: string;
  targetAudience: string;
  framework: ScriptSection;
  fullScript: string;
  variants: PlatformVariant[];
  seoKeywords: string[];
}

export interface CalendarItem {
  id: string;
  ideaId: string;
  scriptId?: string;
  scheduledDate: Date;
  platform: Platform;
  status: "PLANNED" | "READY" | "SCHEDULED" | "PUBLISHED";
  title: string;
  notes?: string;
}

export interface DashboardStats {
  totalIdeas: number;
  scriptsGenerated: number;
  postsScheduled: number;
  postsPublished: number;
  ideasThisMonth: number;
  scriptsThisMonth: number;
}
