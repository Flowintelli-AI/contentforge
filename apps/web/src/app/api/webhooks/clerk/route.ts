import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@contentforge/db";
import { Webhook } from "svix";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 });
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: any;
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { type, data } = evt;

  if (type === "user.created") {
    await db.user.create({
      data: {
        clerkId: data.id,
        email: data.email_addresses[0]?.email_address ?? "",
        fullName: `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || null,
        avatarUrl: data.image_url ?? null,
      },
    });
  }

  if (type === "user.updated") {
    await db.user.updateMany({
      where: { clerkId: data.id },
      data: {
        email: data.email_addresses[0]?.email_address ?? undefined,
        fullName: `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || undefined,
        avatarUrl: data.image_url ?? undefined,
      },
    });
  }

  if (type === "user.deleted") {
    await db.user.updateMany({
      where: { clerkId: data.id },
      data: { deletedAt: new Date() },
    });
  }

  return NextResponse.json({ received: true });
}
