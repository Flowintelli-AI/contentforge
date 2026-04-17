import { createTRPCRouter, protectedProcedure, adminProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const scriptsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REVISION_REQUESTED", "PUBLISHED"])
          .optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Complete onboarding first" });

      const [scripts, total] = await Promise.all([
        ctx.db.script.findMany({
          where: {
            idea: { creatorProfileId: profile.id },
            ...(input.status ? { status: input.status } : {}),
          },
          include: {
            idea: { select: { id: true, rawText: true } },
            versions: { orderBy: { version: "desc" }, take: 1 },
          },
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        ctx.db.script.count({
          where: {
            idea: { creatorProfileId: profile.id },
            ...(input.status ? { status: input.status } : {}),
          },
        }),
      ]);

      return { scripts, total, page: input.page, totalPages: Math.ceil(total / input.limit) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const script = await ctx.db.script.findUnique({
        where: { id: input.id },
        include: {
          idea: true,
          versions: { orderBy: { version: "desc" } },
          adminReview: true,
        },
      });
      if (!script) throw new TRPCError({ code: "NOT_FOUND" });
      return script;
    }),

  submitForReview: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.script.update({
        where: { id: input.id },
        data: { status: "PENDING_REVIEW" },
      });
    }),

  // Admin only
  approve: adminProcedure
    .input(z.object({ id: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.script.update({
        where: { id: input.id },
        data: {
          status: "APPROVED",
          adminReview: {
            upsert: {
              create: { status: "APPROVED", reviewedById: ctx.userId, notes: input.notes },
              update: { status: "APPROVED", notes: input.notes },
            },
          },
        },
      });
    }),

  requestRevision: adminProcedure
    .input(z.object({ id: z.string(), notes: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.script.update({
        where: { id: input.id },
        data: {
          status: "REVISION_REQUESTED",
          adminReview: {
            upsert: {
              create: { status: "REVISION_REQUESTED", reviewedById: ctx.userId, notes: input.notes },
              update: { status: "REVISION_REQUESTED", notes: input.notes },
            },
          },
        },
      });
    }),
});
