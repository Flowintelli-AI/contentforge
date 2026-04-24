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

    try {
      await db.user.upsert({
        where: { clerkId: userId },
        create: { clerkId: userId, email, name },
        update: {},
      });
    } catch (e: any) {
      // P2002 = unique constraint — email already exists with a different clerkId
      // (can happen after DB migration). Re-claim the record with the current clerkId.
      if (e?.code === "P2002") {
        try {
          await db.user.update({ where: { email }, data: { clerkId: userId } });
        } catch (e2) {
          console.error("[trpc] failed to re-claim user by email:", e2);
        }
      } else {
        console.error("[trpc] user upsert error:", e?.message);
      }
    }
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
