// ─── Stripe checkout session API route ───────────────────────────────────────
// POST /api/stripe/checkout

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripeService } from "@/lib/integrations/stripe/service";
import type { SubscriptionTier } from "@/lib/integrations/stripe/interface";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { tier?: SubscriptionTier; organizationId?: string; customerEmail?: string };
  if (!body.tier || !body.organizationId) {
    return NextResponse.json({ error: "tier and organizationId are required" }, { status: 400 });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const session = await stripeService.createCheckoutSession({
      tier: body.tier,
      organizationId: body.organizationId,
      customerEmail: body.customerEmail,
      successUrl: `${appUrl}/dashboard?checkout=success`,
      cancelUrl: `${appUrl}/pricing?checkout=cancelled`,
    });
    return NextResponse.json(session);
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
