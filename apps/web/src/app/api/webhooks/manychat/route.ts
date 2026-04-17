// ─── ManyChat webhook handler ─────────────────────────────────────────────────
// ManyChat sends a POST when a comment keyword is triggered.
// Configure external request URL in ManyChat flow builder.

import { NextResponse } from "next/server";
import { createLogger } from "@/lib/integrations/shared/logger";
import { manyChatService } from "@/lib/integrations/manychat/service";

const logger = createLogger("manychat-webhook");

interface ManyChatWebhookPayload {
  subscriber_id: string;
  first_name?: string;
  last_name?: string;
  /** Custom field from the flow — maps to automation trigger keyword */
  keyword?: string;
  platform?: "INSTAGRAM" | "FACEBOOK";
  page_id?: string;
}

const KEYWORD_FLOWS: Record<string, { flowNs: string; tag: string }> = {
  GUIDE: {
    flowNs: process.env.MANYCHAT_FLOW_GUIDE ?? "",
    tag: "requested-guide",
  },
  LINK: {
    flowNs: process.env.MANYCHAT_FLOW_LINK ?? "",
    tag: "requested-link",
  },
  PLAN: {
    flowNs: process.env.MANYCHAT_FLOW_PLAN ?? "",
    tag: "requested-plan",
  },
};

export async function POST(req: Request) {
  // Verify secret token in query string (?token=...)
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (process.env.MANYCHAT_WEBHOOK_TOKEN && token !== process.env.MANYCHAT_WEBHOOK_TOKEN) {
    logger.warn("Invalid webhook token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ManyChatWebhookPayload;
  try {
    payload = (await req.json()) as ManyChatWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  logger.info("Received webhook", {
    subscriberId: payload.subscriber_id,
    keyword: payload.keyword,
  });

  const keyword = payload.keyword?.toUpperCase();
  const flow = keyword ? KEYWORD_FLOWS[keyword] : undefined;

  if (!flow) {
    logger.warn("Unknown keyword", { keyword });
    return NextResponse.json({ received: true });
  }

  try {
    // Trigger the ManyChat flow + tag subscriber in parallel
    // Note: Automation triggers are tracked via the Automation/AutomationAction models.
    // Webhook-level logging is handled via structured logger below.
    await Promise.all([
      flow.flowNs
        ? manyChatService.triggerFlow({ subscriberId: payload.subscriber_id, flowNs: flow.flowNs })
        : Promise.resolve(),
      manyChatService.tagSubscriber({ subscriberId: payload.subscriber_id, tagName: flow.tag }),
    ]);

    logger.info("Automation triggered", {
      keyword,
      subscriberId: payload.subscriber_id,
      platform: payload.platform ?? "INSTAGRAM",
      flowNs: flow.flowNs,
    });
  } catch (err) {
    logger.error("Automation failed", { err, keyword });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
