import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { startOfMonth } from "date-fns";

export const dashboardRouter = createTRPCRouter({
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
    if (!profile) return null;

    const monthStart = startOfMonth(new Date());

    const [
      totalIdeas,
      scriptsGenerated,
      postsScheduled,
      postsPublished,
      ideasThisMonth,
      scriptsThisMonth,
    ] = await Promise.all([
      ctx.db.contentIdea.count({ where: { creatorProfileId: profile.id } }),
      ctx.db.script.count({ where: { idea: { creatorProfileId: profile.id } } }),
      ctx.db.scheduledPost.count({
        where: { calendarItem: { creatorProfileId: profile.id }, status: "SCHEDULED" },
      }),
      ctx.db.scheduledPost.count({
        where: { calendarItem: { creatorProfileId: profile.id }, status: "PUBLISHED" },
      }),
      ctx.db.contentIdea.count({
        where: { creatorProfileId: profile.id, createdAt: { gte: monthStart } },
      }),
      ctx.db.script.count({
        where: {
          idea: { creatorProfileId: profile.id },
          createdAt: { gte: monthStart },
        },
      }),
    ]);

    return {
      totalIdeas,
      scriptsGenerated,
      postsScheduled,
      postsPublished,
      ideasThisMonth,
      scriptsThisMonth,
    };
  }),

  getRecentActivity: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
    if (!profile) return [];

    return ctx.db.auditLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }),
});
