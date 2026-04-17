import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { startOfMonth, endOfMonth, addDays } from "date-fns";

export const calendarRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2024),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

      const start = startOfMonth(new Date(input.year, input.month - 1));
      const end = endOfMonth(start);

      return ctx.db.contentCalendarItem.findMany({
        where: {
          creatorId: profile.id,
          scheduledFor: { gte: start, lte: end },
        },
        include: {
          script: { select: { title: true } },
        },
        orderBy: { scheduledFor: "asc" },
      });
    }),

  generate: protectedProcedure
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2024),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const profile = await ctx.db.creatorProfile.findUnique({
        where: { userId: user.id },
        include: {
          ideas: { where: { status: "SCRIPTED" }, include: { scripts: true } },
          socialAccounts: { where: { isActive: true } },
        },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

      const start = startOfMonth(new Date(input.year, input.month - 1));
      const activePlatforms = profile.socialAccounts.length > 0
        ? profile.socialAccounts.map((a) => a.platform)
        : (["TIKTOK"] as const);
      const postsPerMonth = profile.postingGoal;
      const ideas = profile.ideas.filter((i) => i.scripts.some((s) => s.status === "APPROVED"));

      if (ideas.length === 0) return { created: 0 };

      const items = [];
      for (let i = 0; i < Math.min(postsPerMonth, ideas.length * activePlatforms.length); i++) {
        const idea = ideas[i % ideas.length];
        const platform = activePlatforms[i % activePlatforms.length];
        const scheduledFor = addDays(start, Math.floor((i / postsPerMonth) * 28));

        items.push({
          creatorId: profile.id,
          scriptId: idea.scripts.find((s) => s.status === "APPROVED")?.id,
          platform,
          scheduledFor,
          status: "DRAFT" as const,
          title: idea.rawIdea.slice(0, 60) + "... [" + platform + "]",
        });
      }

      await ctx.db.contentCalendarItem.createMany({ data: items, skipDuplicates: true });
      return { created: items.length };
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        scheduledFor: z.date().optional(),
        status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "FAILED", "CANCELLED"]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.contentCalendarItem.update({ where: { id }, data });
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.contentCalendarItem.delete({ where: { id: input.id } });
    }),
});
