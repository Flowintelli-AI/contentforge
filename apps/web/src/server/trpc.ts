import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@contentforge/db";
import superjson from "superjson";
import { ZodError } from "zod";

export async function createTRPCContext() {
  const { userId, sessionClaims } = await auth();

  // Auto-upsert user in DB so Clerk webhook isn't required for local dev
  if (userId) {
    const email =
      (sessionClaims?.email as string | undefined) ??
      `${userId}@placeholder.contentforge`;
    const name =
      (sessionClaims?.fullName as string | undefined) ??
      (sessionClaims?.firstName as string | undefined) ??
      email.split("@")[0];

    await db.user.upsert({
      where: { clerkId: userId },
      create: { clerkId: userId, email, name },
      update: {},
    });
  }

  return { userId, db };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

const enforceAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const user = await ctx.db.user.findUnique({
    where: { clerkId: ctx.userId },
    select: { role: true },
  });
  if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(enforceAuth);
export const adminProcedure = t.procedure.use(enforceAdmin);
