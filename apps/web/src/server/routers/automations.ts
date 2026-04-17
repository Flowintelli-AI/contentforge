import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

async function getProfile(ctx: { db: any; userId: string }) {
  const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Creator profile not found" });
  return profile;
}

const actionSchema = z.object({
  actionType: z.enum(["SEND_DM", "SEND_COMMENT_REPLY", "TAG_USER", "ADD_TO_LIST", "WEBHOOK"]),
  template: z.string().min(1, "Message template is required"),
  delaySeconds: z.number().int().min(0).default(0),
  metadata: z.record(z.unknown()).optional(),
});

export const automationsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    return ctx.db.automation.findMany({
      where: { creatorId: profile.id },
      include: { actions: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        platform: z.enum(["TIKTOK", "INSTAGRAM", "YOUTUBE", "TWITTER_X", "LINKEDIN", "FACEBOOK", "PINTEREST"]),
        triggerType: z.enum(["COMMENT_KEYWORD", "DM_KEYWORD", "POST_REACTION", "STORY_REPLY"]).default("COMMENT_KEYWORD"),
        triggerKeyword: z.string().min(1).max(50).toUpperCase().optional(),
        postUrl: z.string().url().optional().or(z.literal("")),
        actions: z.array(actionSchema).min(1, "At least one action is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      return ctx.db.automation.create({
        data: {
          creatorId: profile.id,
          name: input.name,
          platform: input.platform,
          triggerType: input.triggerType,
          triggerKeyword: input.triggerKeyword?.toUpperCase(),
          postUrl: input.postUrl || null,
          actions: {
            create: input.actions.map((a, i) => ({
              order: i,
              actionType: a.actionType,
              template: a.template,
              delaySeconds: a.delaySeconds,
              metadata: (a.metadata ?? {}) as object,
            })),
          },
        },
        include: { actions: { orderBy: { order: "asc" } } },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        triggerKeyword: z.string().min(1).max(50).optional(),
        postUrl: z.string().url().optional().or(z.literal("")),
        // Update the first action's template (simple single-action edit)
        actionTemplate: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const automation = await ctx.db.automation.findFirst({
        where: { id: input.id, creatorId: profile.id },
        include: { actions: { orderBy: { order: "asc" } } },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND" });

      const [updated] = await ctx.db.$transaction([
        ctx.db.automation.update({
          where: { id: input.id },
          data: {
            ...(input.name && { name: input.name }),
            ...(input.triggerKeyword && { triggerKeyword: input.triggerKeyword.toUpperCase() }),
            ...(input.postUrl !== undefined && { postUrl: input.postUrl || null }),
          },
          include: { actions: { orderBy: { order: "asc" } } },
        }),
        ...(input.actionTemplate && automation.actions[0]
          ? [
              ctx.db.automationAction.update({
                where: { id: automation.actions[0].id },
                data: { template: input.actionTemplate },
              }),
            ]
          : []),
      ]);
      return updated;
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const automation = await ctx.db.automation.findFirst({
        where: { id: input.id, creatorId: profile.id },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.automation.update({
        where: { id: input.id },
        data: { isActive: !automation.isActive },
        include: { actions: { orderBy: { order: "asc" } } },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const automation = await ctx.db.automation.findFirst({
        where: { id: input.id, creatorId: profile.id },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.automation.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
