// ─── Integrations tRPC router ─────────────────────────────────────────────────

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { postizService } from "@/lib/integrations/postiz/service";
import { opusClipService } from "@/lib/integrations/opusclip/service";
import { heyGenService } from "@/lib/integrations/heygen/service";
import { elevenLabsService } from "@/lib/integrations/elevenlabs/service";
import { stripeService } from "@/lib/integrations/stripe/service";
import type { SocialPlatform } from "@/lib/integrations/postiz/interface";
import type { SubscriptionTier } from "@/lib/integrations/stripe/interface";

export const integrationsRouter = createTRPCRouter({
  // ── Postiz ──────────────────────────────────────────────────────────────────
  schedulePost: protectedProcedure
    .input(
      z.object({
        calendarItemId: z.string(),
        platform: z.enum(["TIKTOK", "INSTAGRAM", "YOUTUBE", "TWITTER", "LINKEDIN", "FACEBOOK"]),
        content: z.string().min(1),
        mediaUrls: z.array(z.string().url()).optional(),
        scheduledFor: z.date(),
        postizProfileId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await postizService.schedulePost({
        platform: input.platform as SocialPlatform,
        content: input.content,
        mediaUrls: input.mediaUrls,
        scheduledFor: input.scheduledFor,
        postizProfileId: input.postizProfileId,
        calendarItemId: input.calendarItemId,
      });
      return result;
    }),

  getPostStatus: protectedProcedure
    .input(z.object({ postizPostId: z.string() }))
    .query(async ({ input }) => {
      return postizService.getPostStatus(input.postizPostId);
    }),

  cancelPost: protectedProcedure
    .input(z.object({ postizPostId: z.string() }))
    .mutation(async ({ input }) => {
      await postizService.cancelPost(input.postizPostId);
    }),

  // ── Opus Clip ────────────────────────────────────────────────────────────────
  submitVideoForRepurposing: protectedProcedure
    .input(
      z.object({
        videoId: z.string(),
        videoUrl: z.string().url(),
        title: z.string(),
        aspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await opusClipService.submitVideo({
        videoUrl: input.videoUrl,
        title: input.title,
        videoId: input.videoId,
        aspectRatio: input.aspectRatio,
      });
      return result;
    }),

  getRepurposingStatus: protectedProcedure
    .input(z.object({ opusJobId: z.string() }))
    .query(async ({ input }) => {
      return opusClipService.getStatus(input.opusJobId);
    }),

  getClips: protectedProcedure
    .input(z.object({ opusJobId: z.string() }))
    .query(async ({ input }) => {
      return opusClipService.getClips(input.opusJobId);
    }),

  // ── HeyGen ──────────────────────────────────────────────────────────────────
  listAvatars: protectedProcedure.query(async () => {
    return heyGenService.listAvatars();
  }),

  generateAvatarVideo: protectedProcedure
    .input(
      z.object({
        scriptId: z.string(),
        avatarId: z.string(),
        voiceId: z.string(),
        script: z.string().min(1).max(5000),
        aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await heyGenService.generateAvatarVideo({
        avatarId: input.avatarId,
        voiceId: input.voiceId,
        script: input.script,
        scriptId: input.scriptId,
        aspectRatio: input.aspectRatio,
      });
      return result;
    }),

  getAvatarVideoStatus: protectedProcedure
    .input(z.object({ heygenVideoId: z.string() }))
    .query(async ({ input }) => {
      return heyGenService.getVideoStatus(input.heygenVideoId);
    }),

  // ── ElevenLabs ───────────────────────────────────────────────────────────────
  listVoices: protectedProcedure.query(async () => {
    return elevenLabsService.listVoices();
  }),

  generateSpeech: protectedProcedure
    .input(
      z.object({
        scriptId: z.string(),
        voiceId: z.string(),
        text: z.string().min(1).max(5000),
        stability: z.number().min(0).max(1).optional(),
        similarityBoost: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await elevenLabsService.generateSpeech({
        voiceId: input.voiceId,
        text: input.text,
        scriptId: input.scriptId,
        stability: input.stability,
        similarityBoost: input.similarityBoost,
      });
      return result;
    }),

  // ── Stripe ───────────────────────────────────────────────────────────────────
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        tier: z.enum(["BASIC", "GROWTH", "PREMIUM"]),
        organizationId: z.string(),
        customerEmail: z.string().email().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const result = await stripeService.createCheckoutSession({
        tier: input.tier as SubscriptionTier,
        organizationId: input.organizationId,
        customerEmail: input.customerEmail,
        successUrl: `${appUrl}/dashboard?checkout=success&tier=${input.tier}`,
        cancelUrl: `${appUrl}/pricing?checkout=cancelled`,
      });
      return result;
    }),

  createPortalSession: protectedProcedure
    .input(z.object({ stripeCustomerId: z.string() }))
    .mutation(async ({ input }) => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      return stripeService.createPortalSession({
        stripeCustomerId: input.stripeCustomerId,
        returnUrl: `${appUrl}/dashboard/settings`,
      });
    }),
});
