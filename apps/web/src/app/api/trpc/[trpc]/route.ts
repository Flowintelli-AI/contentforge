import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";
import { createTRPCContext } from "@/server/trpc";
import { appRouter } from "@/server/routers";

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError: ({ path, error }) => {
      console.error(`❌ tRPC error on '${path}':`, error);
    },
  });

export { handler as GET, handler as POST };
