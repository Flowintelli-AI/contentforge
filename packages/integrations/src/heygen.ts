import axios from "axios";

const BASE_URL = process.env.HEYGEN_API_URL ?? "https://api.heygen.com/v1";
const API_KEY = process.env.HEYGEN_API_KEY ?? "";

const client = axios.create({
  baseURL: BASE_URL,
  headers: { "X-Api-Key": API_KEY, "Content-Type": "application/json" },
});

export interface HeyGenVideoOptions {
  script: string;
  avatarId: string;
  voiceId?: string;
  backgroundId?: string;
}

export interface HeyGenVideoJob {
  videoId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
}

export async function createAvatarVideo(options: HeyGenVideoOptions): Promise<HeyGenVideoJob> {
  if (!API_KEY) {
    // Mock for development
    return { videoId: `mock-${Date.now()}`, status: "pending" };
  }

  const res = await client.post("/video.generate", {
    video_inputs: [
      {
        character: { type: "avatar", avatar_id: options.avatarId },
        voice: { type: "text", input_text: options.script, voice_id: options.voiceId },
        background: options.backgroundId
          ? { type: "preset", value: options.backgroundId }
          : undefined,
      },
    ],
    test: process.env.NODE_ENV !== "production",
    aspect_ratio: "9:16",
  });

  return {
    videoId: res.data.data.video_id,
    status: "pending",
  };
}

export async function getVideoStatus(videoId: string): Promise<HeyGenVideoJob> {
  if (!API_KEY || videoId.startsWith("mock-")) {
    return {
      videoId,
      status: "completed",
      videoUrl: "https://example.com/mock-avatar-video.mp4",
    };
  }

  const res = await client.get(`/video_status.get?video_id=${videoId}`);
  const data = res.data.data;

  return {
    videoId,
    status: data.status,
    videoUrl: data.video_url,
  };
}

export async function listAvatars(): Promise<{ avatarId: string; name: string; gender: string }[]> {
  if (!API_KEY) return [];
  const res = await client.get("/avatar.list");
  return (res.data.data.avatars ?? []).map((a: any) => ({
    avatarId: a.avatar_id,
    name: a.avatar_name,
    gender: a.gender,
  }));
}
