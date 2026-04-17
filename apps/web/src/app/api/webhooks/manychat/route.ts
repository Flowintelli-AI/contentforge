// ─── ManyChat External Request webhook ────────────────────────────────────────
// In ManyChat flow builder, add an "External Request" block and point it here.
// ManyChat POSTs subscriber data when a keyword comment fires; we look up the
// matching DB automation and return a v2 message for ManyChat to send as a DM.
//
// Expected POST body: { subscriber_id, first_name, keyword, platform }
// Response format:    { version: "v2", content: { messages: [{ type: "text", text }] } }
//
// Optional: add ?token=<MANYCHAT_WEBHOOK_TOKEN> to the URL in ManyChat for auth.

import { NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { createLogger } from "@/lib/integrations/shared/logger";

const logger = createLogger("manychat-webhook");

const PLATFORM_MAP: Record<string, string> = {
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
  tiktok: "TIKTOK",
  twitter: "TWITTER_X",
  twitter_x: "TWITTER_X",
  youtube: "YOUTUBE",
  linkedin: "LINKEDIN",
};

/** ManyChat requires HTTP 200 even for logic errors — wrap in a text DM. */
function dmReply(text: string) {
  return NextResponse.json({ version: "v2", content: { messages: [{ type: "text", text }] } });
}

export async function POST(req: Request) {
  // Optional token auth
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (process.env.MANYCHAT_WEBHOOK_TOKEN && token !== process.env.MANYCHAT_WEBHOOK_TOKEN) {
    logger.warn("Invalid webhook token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { subscriber_id, first_name = "there", keyword, platform } = body;
  logger.info("Received webhook", { subscriber_id, keyword, platform });

  if (!keyword || !platform) {
    return dmReply("Missing keyword or platform — check your ManyChat flow setup.");
  }

  const platformKey = PLATFORM_MAP[platform.toLowerCase()];
  if (!platformKey) return dmReply(`Unsupported platform: ${platform}`);

  // Look up the active automation for this keyword + platform
  const automation = await db.automation.findFirst({
    where: {
      triggerKeyword: keyword.toUpperCase(),
      platform: platformKey as any,
      isActive: true,
    },
    include: {
      actions: {
        where: { actionType: "SEND_DM" },
        orderBy: { order: "asc" },
        take: 1,
      },
    },
  });

  if (!automation || automation.actions.length === 0) {
    logger.warn("No active automation found", { keyword, platformKey });
    return dmReply("No active automation configured for this keyword.");
  }

  // Interpolate {{variables}} in the template
  const text = automation.actions[0].template
    .replace(/\{\{first_name\}\}/gi, first_name)
    .replace(/\{\{subscriber_id\}\}/gi, subscriber_id ?? "")
    .replace(/\{\{keyword\}\}/gi, keyword);

  logger.info("Automation matched", { automationId: automation.id, keyword });
  return dmReply(text);
}
