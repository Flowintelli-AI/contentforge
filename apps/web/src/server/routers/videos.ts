import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { del } from "@vercel/blob";

async function getProfile(ctx: { userId: string; db: typeof import("@contentforge/db").db }) {
  const user = await ctx.db.user.findUnique({ where: { clerkId: ctx.userId } });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  const profile = await ctx.db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Creator profile not found" });
  return profile;
}

export const videosRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getProfile(ctx);
    return ctx.db.uploadedVideo.findMany({
      where: { creatorId: profile.id },
      include: { clips: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        storagePath: z.string().url(),
        sizeBytes: z.number().optional(),
        mimeType: z.string().optional(),
        duration: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      return ctx.db.uploadedVideo.create({
        data: {
          creatorId: profile.id,
          title: input.title,
          description: input.description,
          storagePath: input.storagePath,
          sizeBytes: input.sizeBytes ? BigInt(input.sizeBytes) : undefined,
          mimeType: input.mimeType,
          duration: input.duration,
          status: "READY",
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      const video = await ctx.db.uploadedVideo.findFirst({
        where: { id: input.id, creatorId: profile.id },
      });
      if (!video) throw new TRPCError({ code: "NOT_FOUND" });

      // Delete from Vercel Blob
      try {
        await del(video.storagePath);
      } catch {
        // Non-fatal — blob may already be gone
      }

      await ctx.db.uploadedVideo.delete({ where: { id: input.id } });
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["UPLOADING", "PROCESSING", "READY", "FAILED", "ARCHIVED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getProfile(ctx);
      return ctx.db.uploadedVideo.updateMany({
        where: { id: input.id, creatorId: profile.id },
        data: { status: input.status },
      });
    }),
});
