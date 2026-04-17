/**
 * Instagram / Meta webhook handler
 *
 * GET  /api/webhooks/instagram  — hub.challenge verification (Meta calls this once)
 * POST /api/webhooks/instagram  — receives comment & DM events
 *
 * Meta webhook setup: https://developers.facebook.com/docs/graph-api/webhooks
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@contentforge/db";
import {
  sendInstagramDM,
  replyToComment,
  verifyWebhookToken,
} from "@/lib/integrations/instagram/service";

// ─── GET — hub.challenge verification ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && verifyWebhookToken(token)) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST — event handler ─────────────────────────────────────────────────────

interface MetaCommentValue {
  from: { id: string; username?: string };
  text: string;
  comment_id: string;
  media: { id: string };
}

interface MetaMessageValue {
  sender: { id: string };
  recipient: { id: string };
  message: { mid: string; text: string };
}

interface MetaWebhookEntry {
  changes?: Array<{
    field: string;
    value: MetaCommentValue | MetaMessageValue;
  }>;
  messaging?: MetaMessageValue[];
}

interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

export async function POST(req: NextRequest) {
  let body: MetaWebhookPayload;
  try {
    body = (await req.json()) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.object !== "instagram" && body.object !== "page") {
    return NextResponse.json({ ok: true });
  }

  // Process all entries concurrently
  await Promise.allSettled(body.entry.map((entry) => processEntry(entry)));

  return NextResponse.json({ ok: true });
}

// ─── Entry dispatcher ─────────────────────────────────────────────────────────

async function processEntry(entry: MetaWebhookEntry) {
  // Comment events arrive via `changes`
  if (entry.changes) {
    for (const change of entry.changes) {
      if (change.field === "comments") {
        await handleComment(change.value as MetaCommentValue);
      }
    }
  }

  // DM events arrive via `messaging`
  if (entry.messaging) {
    for (const msg of entry.messaging) {
      await handleDirectMessage(msg);
    }
  }
}

// ─── Comment handler ──────────────────────────────────────────────────────────

async function handleComment(value: MetaCommentValue) {
  const text = value.text?.trim().toUpperCase() ?? "";
  const senderIgId = value.from?.id;
  if (!senderIgId) return;

  // Find matching active automation by keyword (INSTAGRAM platform, COMMENT_KEYWORD trigger)
  const automation = await db.automation.findFirst({
    where: {
      platform: "INSTAGRAM",
      triggerType: "COMMENT_KEYWORD",
      isActive: true,
      triggerKeyword: { equals: text, mode: "insensitive" },
    },
    include: { actions: { orderBy: { order: "asc" } }, creator: true },
  });

  if (!automation) return;

  // Get IG connection for this creator
  const igConn = await db.igConnection.findUnique({
    where: { creatorId: automation.creatorId },
  });
  if (!igConn) return;

  // Upsert subscriber
  const subscriber = await db.igSubscriber.upsert({
    where: {
      creatorId_igUserId: {
        creatorId: automation.creatorId,
        igUserId: senderIgId,
      },
    },
    create: {
      creatorId: automation.creatorId,
      igUserId: senderIgId,
      igUsername: value.from.username,
      source: "COMMENT_KEYWORD",
      tags: [text],
    },
    update: {
      lastSeenAt: new Date(),
      igUsername: value.from.username ?? undefined,
    },
  });

  // Execute automation actions
  for (const action of automation.actions) {
    const message = interpolate(action.template, {
      keyword: text,
      subscriber_id: senderIgId,
      username: value.from.username ?? senderIgId,
    });

    let success = true;
    let errorMsg: string | undefined;

    if (action.actionType === "SEND_DM") {
      // Use comment_id so Meta resolves the commenter even if we don't have their IGSID
      const result = await sendInstagramDM(
        { comment_id: value.comment_id },
        message,
        igConn.accessToken
      );
      success = result.success;
      errorMsg = result.error;
    } else if (action.actionType === "SEND_COMMENT_REPLY") {
      const result = await replyToComment(
        value.comment_id,
        message,
        igConn.accessToken
      );
      success = result.success;
      errorMsg = result.error;
    }

    await db.automationEvent.create({
      data: {
        automationId: automation.id,
        subscriberId: subscriber.id,
        eventType: "COMMENT_KEYWORD",
        keyword: text,
        commentId: value.comment_id,
        status: success ? "SENT" : "FAILED",
        errorMsg: errorMsg ?? null,
      },
    });
  }
}

// ─── DM handler ───────────────────────────────────────────────────────────────

async function handleDirectMessage(value: MetaMessageValue) {
  const text = value.message?.text?.trim().toUpperCase() ?? "";
  const senderIgId = value.sender?.id;
  const recipientIgId = value.recipient?.id; // this is the creator's IG ID
  if (!senderIgId || !recipientIgId) return;

  // Find the creator's IgConnection by their igUserId
  const igConn = await db.igConnection.findFirst({
    where: { igUserId: recipientIgId },
  });
  if (!igConn) return;

  const automation = await db.automation.findFirst({
    where: {
      creatorId: igConn.creatorId,
      platform: "INSTAGRAM",
      triggerType: "DM_KEYWORD",
      isActive: true,
      triggerKeyword: { equals: text, mode: "insensitive" },
    },
    include: { actions: { orderBy: { order: "asc" } } },
  });

  if (!automation) return;

  const subscriber = await db.igSubscriber.upsert({
    where: {
      creatorId_igUserId: {
        creatorId: igConn.creatorId,
        igUserId: senderIgId,
      },
    },
    create: {
      creatorId: igConn.creatorId,
      igUserId: senderIgId,
      source: "DM_KEYWORD",
      tags: [text],
    },
    update: { lastSeenAt: new Date() },
  });

  for (const action of automation.actions) {
    if (action.actionType !== "SEND_DM") continue;

    const message = interpolate(action.template, {
      keyword: text,
      subscriber_id: senderIgId,
    });

    const result = await sendInstagramDM(
      { id: senderIgId },
      message,
      igConn.accessToken
    );

    await db.automationEvent.create({
      data: {
        automationId: automation.id,
        subscriberId: subscriber.id,
        eventType: "DM_KEYWORD",
        keyword: text,
        messageId: value.message.mid,
        status: result.success ? "SENT" : "FAILED",
        errorMsg: result.error ?? null,
      },
    });
  }
}

// ─── Template interpolation ───────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}
