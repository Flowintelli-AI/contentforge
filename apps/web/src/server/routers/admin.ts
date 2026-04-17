import { createTRPCRouter, adminProcedure } from "@/server/trpc";
import { z } from "zod";

export const adminRouter = createTRPCRouter({
  getReviewQueue: adminProcedure
    .input(
      z.object({
        type: z.enum(["scripts", "ideas", "blogs"]).default("scripts"),
        status: z.enum(["PENDING", "APPROVED", "REJECTED", "REVISION_REQUESTED"]).default("PENDING"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.type === "scripts") {
        const [items, total] = await Promise.all([
          ctx.db.script.findMany({
            where: { status: "PENDING_REVIEW" },
            include: {
              idea: { include: { creatorProfile: true } },
              versions: { take: 1, orderBy: { version: "desc" } },
              adminReview: true,
            },
            orderBy: { updatedAt: "asc" },
            skip: (input.page - 1) * input.limit,
            take: input.limit,
          }),
          ctx.db.script.count({ where: { status: "PENDING_REVIEW" } }),
        ]);
        return { items, total, type: "scripts" };
      }

      return { items: [], total: 0, type: input.type };
    }),

  getDashboardMetrics: adminProcedure.query(async ({ ctx }) => {
    const [totalUsers, totalIdeas, pendingReviews, publishedPosts] = await Promise.all([
      ctx.db.user.count(),
      ctx.db.contentIdea.count(),
      ctx.db.script.count({ where: { status: "PENDING_REVIEW" } }),
      ctx.db.scheduledPost.count({ where: { status: "PUBLISHED" } }),
    ]);
    return { totalUsers, totalIdeas, pendingReviews, publishedPosts };
  }),

  listUsers: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const where = input.search
        ? {
            OR: [
              { email: { contains: input.search, mode: "insensitive" as const } },
              { fullName: { contains: input.search, mode: "insensitive" as const } },
            ],
          }
        : {};

      const [users, total] = await Promise.all([
        ctx.db.user.findMany({
          where,
          include: { creatorProfile: true },
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        ctx.db.user.count({ where }),
      ]);
      return { users, total };
    }),
});
