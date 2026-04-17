// ─── Stripe integration interface ────────────────────────────────────────────

export type SubscriptionTier = "BASIC" | "GROWTH" | "PREMIUM";

export interface CheckoutSessionParams {
  organizationId: string;
  tier: SubscriptionTier;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface PortalSessionParams {
  stripeCustomerId: string;
  returnUrl: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface IStripeService {
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult>;
  createPortalSession(params: PortalSessionParams): Promise<PortalSessionResult>;
  cancelSubscription(stripeSubId: string): Promise<void>;
}
