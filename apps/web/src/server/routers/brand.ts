import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter as router, protectedProcedure } from "../trpc";

async function getProfile(ctx: { userId: string; db: { user: { findUnique: Function }; creatorProfile: { findUnique: Function } } }) {
  const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Creator profile not found" });
  return profile as { id: string };
}

const BrandKitInput = z.object({
  brandName: z.string().min(1).optional(),
  handle: z.string().optional(),
  niche: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  voiceNotes: z.string().optional(),
});

export const brandRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    const kit = await ctx.db.brandKit.findUnique({ where: { creatorId: profile.id } });
    return kit ?? null;
  }),

  save: protectedProcedure
    .input(BrandKitInput)
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      return ctx.db.brandKit.upsert({
        where: { creatorId: profile.id },
        update: input,
        create: { creatorId: profile.id, ...input },
      });
    }),
});
