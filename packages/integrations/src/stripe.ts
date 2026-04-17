// Stripe billing integration

import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export const PRICE_IDS = {
  basic:   process.env.STRIPE_PRICE_BASIC!,
  growth:  process.env.STRIPE_PRICE_GROWTH!,
  premium: process.env.STRIPE_PRICE_PREMIUM!,
} as const;

export type PriceTier = keyof typeof PRICE_IDS;

// ── Create checkout session ───────────────────────────────────────────────────

export async function createCheckoutSession({
  tier,
  organizationId,
  customerEmail,
  successUrl,
  cancelUrl,
}: {
  tier: PriceTier;
  organizationId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: customerEmail,
    line_items: [{ price: PRICE_IDS[tier], quantity: 1 }],
    metadata: { organizationId, tier },
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      trial_period_days: 14,
      metadata: { organizationId, tier },
    },
  });

  return session.url!;
}

// ── Create billing portal session ─────────────────────────────────────────────

export async function createPortalSession(stripeCustomerId: string, returnUrl: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

// ── Verify webhook signature ──────────────────────────────────────────────────

export function constructWebhookEvent(payload: string | Buffer, sig: string): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!);
}
