// ─── Stripe service implementation ───────────────────────────────────────────

import Stripe from "stripe";
import { withRetry, isRetryableHttpError } from "../shared/retry";
import { createLogger } from "../shared/logger";
import type {
  IStripeService,
  CheckoutSessionParams,
  CheckoutSessionResult,
  PortalSessionParams,
  PortalSessionResult,
} from "./interface";

const logger = createLogger("stripe");

const PRICE_MAP: Record<string, string | undefined> = {
  BASIC: process.env.STRIPE_PRICE_BASIC,
  GROWTH: process.env.STRIPE_PRICE_GROWTH,
  PREMIUM: process.env.STRIPE_PRICE_PREMIUM,
};

// ── Mock implementation ───────────────────────────────────────────────────────

class MockStripeService implements IStripeService {
  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    logger.info("MOCK createCheckoutSession", params);
    return {
      sessionId: `mock_session_${Date.now()}`,
      url: `${params.successUrl}?mock=true&tier=${params.tier}`,
    };
  }

  async createPortalSession(params: PortalSessionParams): Promise<PortalSessionResult> {
    logger.info("MOCK createPortalSession", params);
    return { url: `${params.returnUrl}?mock_portal=true` };
  }

  async cancelSubscription(stripeSubId: string): Promise<void> {
    logger.info("MOCK cancelSubscription", { stripeSubId });
  }
}

// ── Live implementation ───────────────────────────────────────────────────────

class LiveStripeService implements IStripeService {
  private stripe: Stripe;

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey, { apiVersion: "2024-04-10" as any });
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    const priceId = PRICE_MAP[params.tier];
    if (!priceId) throw new Error(`No Stripe price configured for tier: ${params.tier}`);

    return withRetry(
      async () => {
        const session = await this.stripe.checkout.sessions.create({
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: params.successUrl,
          cancel_url: params.cancelUrl,
          customer_email: params.customerEmail,
          metadata: { organizationId: params.organizationId, tier: params.tier },
        });
        logger.info("Checkout session created", { sessionId: session.id });
        return { sessionId: session.id, url: session.url! };
      },
      { shouldRetry: isRetryableHttpError }
    );
  }

  async createPortalSession(params: PortalSessionParams): Promise<PortalSessionResult> {
    return withRetry(
      async () => {
        const session = await this.stripe.billingPortal.sessions.create({
          customer: params.stripeCustomerId,
          return_url: params.returnUrl,
        });
        return { url: session.url };
      },
      { shouldRetry: isRetryableHttpError }
    );
  }

  async cancelSubscription(stripeSubId: string): Promise<void> {
    return withRetry(
      async () => {
        await this.stripe.subscriptions.cancel(stripeSubId);
        logger.info("Subscription cancelled", { stripeSubId });
      },
      { shouldRetry: isRetryableHttpError }
    );
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export const stripeService: IStripeService = process.env.STRIPE_SECRET_KEY
  ? new LiveStripeService(process.env.STRIPE_SECRET_KEY)
  : new MockStripeService();
