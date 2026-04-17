import axios from "axios";

const API_KEY = process.env.MANYCHAT_API_KEY ?? "";
const BASE_URL = "https://api.manychat.com";

const client = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
});

export interface CommentTrigger {
  keyword: string;
  platform: "instagram" | "facebook";
  flowId: string;
}

export interface DMFlowOptions {
  subscriberId: string;
  message: string;
  flowId?: string;
}

export async function sendDirectMessage(options: DMFlowOptions): Promise<boolean> {
  if (!API_KEY) {
    console.log("[ManyChat Mock] Would send DM:", options);
    return true;
  }

  try {
    if (options.flowId) {
      await client.post("/fb/sending/sendFlow", {
        subscriber_id: options.subscriberId,
        flow_ns: options.flowId,
      });
    } else {
      await client.post("/fb/sending/sendContent", {
        subscriber_id: options.subscriberId,
        data: {
          version: "v2",
          content: {
            messages: [{ type: "text", text: options.message }],
          },
        },
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function createKeywordTrigger(trigger: CommentTrigger): Promise<{ triggerId: string }> {
  if (!API_KEY) {
    return { triggerId: `mock-trigger-${Date.now()}` };
  }
  // ManyChat doesn't expose comment triggers via API — must be configured in UI
  // This is a placeholder for future webhook-based approach
  throw new Error("Comment triggers must be configured in ManyChat UI. Use webhook callback instead.");
}

export async function getSubscriberByPhone(phone: string): Promise<{ id: string } | null> {
  if (!API_KEY) return null;
  try {
    const res = await client.get(`/fb/subscriber/findByUserRef?user_ref=${encodeURIComponent(phone)}`);
    return { id: res.data.data?.id };
  } catch {
    return null;
  }
}
