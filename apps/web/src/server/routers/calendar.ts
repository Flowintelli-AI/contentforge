import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { startOfMonth, endOfMonth, addDays } from "date-fns";

const platformEnum = z.enum(["TIKTOK", "INSTAGRAM", "YOUTUBE", "TWITTER", "LINKEDIN"]);

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
          creatorProfileId: profile.id,
          scheduledDate: { gte: start, lte: end },
        },
        include: {
          idea: { select: { rawText: true } },
          script: { select: { title: true } },
          scheduledPost: true,
        },
        orderBy: { scheduledDate: "asc" },
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
        include: { ideas: { where: { status: "SCRIPTED" }, include: { scripts: true } } },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

      const start = startOfMonth(new Date(input.year, input.month - 1));
      const platforms = profile.primaryPlatforms as string[];
      const postsPerMonth = profile.postingGoalPerMonth;
      const ideas = profile.ideas.filter((i) => i.scripts.some((s) => s.status === "APPROVED"));

      const items = [];
      for (let i = 0; i < Math.min(postsPerMonth, ideas.length * platforms.length); i++) {
        const idea = ideas[i % ideas.length];
        const platform = platforms[i % platforms.length];
        const scheduledDate = addDays(start, Math.floor((i / postsPerMonth) * 28));

        items.push({
          creatorProfileId: profile.id,
          ideaId: idea.id,
          scriptId: idea.scripts.find((s) => s.status === "APPROVED")?.id,
          platform: platform as any,
          scheduledDate,
          status: "PLANNED" as const,
          title: `${idea.rawText.slice(0, 60)}… [${platform}]`,
        });
      }

      await ctx.db.contentCalendarItem.createMany({ data: items, skipDuplicates: true });
      return { created: items.length };
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        scheduledDate: z.date().optional(),
        status: z.enum(["PLANNED", "READY", "SCHEDULED", "PUBLISHED"]).optional(),
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
