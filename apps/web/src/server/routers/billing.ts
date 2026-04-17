import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { stripeService } from "@/lib/integrations/stripe/service";
import { TRPCError } from "@trpc/server";

async function getOrCreateOrg(ctx: { userId: string; db: typeof import("@contentforge/db").db }) {
  const user = await ctx.db.user.findUnique({
    where: { clerkId: ctx.userId },
    include: {
      organization: {
        include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });

  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

  // Auto-create a personal org if none exists
  if (!user.organization) {
    const org = await ctx.db.organization.create({
      data: {
        name: `${user.name}'s Workspace`,
        slug: `ws-${user.clerkId.slice(-8).toLowerCase()}`,
        users: { connect: { id: user.id } },
      },
      include: { subscriptions: true },
    });
    return { user, org, subscription: null };
  }

  const subscription = user.organization.subscriptions[0] ?? null;
  return { user, org: user.organization, subscription };
}

export const billingRouter = createTRPCRouter({
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const { subscription } = await getOrCreateOrg(ctx);
    return {
      tier: subscription?.tier ?? "FREE",
      status: subscription?.status ?? "ACTIVE",
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      stripeCustomerId: subscription?.stripeCustomerId ?? null,
    };
  }),

  createCheckoutSession: protectedProcedure
    .input(z.object({ tier: z.enum(["BASIC", "GROWTH", "PREMIUM"]) }))
    .mutation(async ({ ctx, input }) => {
      const { user, org } = await getOrCreateOrg(ctx);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      const session = await stripeService.createCheckoutSession({
        tier: input.tier,
        organizationId: org.id,
        customerEmail: user.email,
        successUrl: `${appUrl}/dashboard?checkout=success`,
        cancelUrl: `${appUrl}/pricing?checkout=cancelled`,
      });

      return session;
    }),

  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const { subscription } = await getOrCreateOrg(ctx);

    if (!subscription?.stripeCustomerId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No active billing account. Please subscribe first.",
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const portal = await stripeService.createPortalSession({
      stripeCustomerId: subscription.stripeCustomerId,
      returnUrl: `${appUrl}/dashboard/settings/billing`,
    });

    return portal;
  }),
});
