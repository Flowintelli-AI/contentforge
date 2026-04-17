import { createTRPCRouter, protectedProcedure, adminProcedure, publicProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const creatorsRouter = createTRPCRouter({
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { clerkId: ctx.userId },
      include: {
        creatorProfile: {
          include: { niche: true, influencers: true, contentPillars: true },
        },
        organizations: {
          include: { organization: { include: { subscription: true } } },
        },
      },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    return user;
  }),

  completeOnboarding: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(2).max(60),
        bio: z.string().max(500).optional(),
        nicheId: z.string(),
        primaryPlatforms: z.array(
          z.enum(["TIKTOK", "INSTAGRAM", "YOUTUBE", "TWITTER", "LINKEDIN"])
        ),
        postingGoalPerMonth: z.number().int().min(1).max(200),
        influencerIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { clerkId: ctx.userId },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const profile = await ctx.db.creatorProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          displayName: input.displayName,
          bio: input.bio,
          nicheId: input.nicheId,
          primaryPlatforms: input.primaryPlatforms,
          postingGoalPerMonth: input.postingGoalPerMonth,
          influencers: input.influencerIds
            ? { connect: input.influencerIds.map((id) => ({ id })) }
            : undefined,
        },
        update: {
          displayName: input.displayName,
          bio: input.bio,
          nicheId: input.nicheId,
          primaryPlatforms: input.primaryPlatforms,
          postingGoalPerMonth: input.postingGoalPerMonth,
          influencers: input.influencerIds
            ? { set: input.influencerIds.map((id) => ({ id })) }
            : undefined,
        },
      });

      await ctx.db.user.update({
        where: { id: user.id },
        data: { onboardingComplete: true },
      });

      return profile;
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(2).max(60).optional(),
        bio: z.string().max(500).optional(),
        avatarUrl: z.string().url().optional(),
        websiteUrl: z.string().url().optional(),
        postingGoalPerMonth: z.number().int().min(1).max(200).optional(),
        primaryPlatforms: z
          .array(z.enum(["TIKTOK", "INSTAGRAM", "YOUTUBE", "TWITTER", "LINKEDIN"]))
          .optional(),
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


