import { createTRPCRouter, protectedProcedure, adminProcedure, publicProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const creatorsRouter = createTRPCRouter({
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { clerkId: ctx.userId },
      include: {
        creatorProfile: {
          include: {
            niches: { include: { niche: true } },
            influencers: { include: { influencer: true } },
            socialAccounts: true,
          },
        },
        organization: { include: { subscriptions: true } },
      },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    return user;
  }),

  completeOnboarding: protectedProcedure
    .input(
      z.object({
        niches: z.array(z.string()).min(1).max(3),
        postingGoal: z.number().int().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const profile = await ctx.db.creatorProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          displayName: user.name ?? user.email.split("@")[0],
          postingGoal: input.postingGoal,
          onboardingDone: true,
          timezone: "UTC",
        },
        update: {
          postingGoal: input.postingGoal,
          onboardingDone: true,
        },
      });

      // Upsert niche records and link them
      for (let i = 0; i < input.niches.length; i++) {
        const nicheName = input.niches[i];
        const niche = await ctx.db.niche.upsert({
          where: { name: nicheName },
          create: {
            name: nicheName,
            slug: nicheName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          },
          update: {},
        });

        await ctx.db.nicheOnCreator.upsert({
          where: { creatorId_nicheId: { creatorId: profile.id, nicheId: niche.id } },
          create: { creatorId: profile.id, nicheId: niche.id, isPrimary: i === 0 },
          update: {},
        });
      }

      return profile;
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(2).max(60).optional(),
        bio: z.string().max(500).optional(),
        postingGoal: z.number().int().min(1).max(200).optional(),
        timezone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.creatorProfile.update({
        where: { userId: user.id },
        data: input,
      });
    }),

  listNiches: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.niche.findMany({ orderBy: { name: "asc" } });
  }),

  listInfluencers: protectedProcedure
    .input(z.object({ nicheId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.influencer.findMany({
        where: input?.nicheId ? { nicheId: input.nicheId } : undefined,
        orderBy: { name: "asc" },
        take: 50,
      });
    }),
});
