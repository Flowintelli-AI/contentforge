import { createTRPCRouter } from "@/server/trpc";
import { ideasRouter } from "./ideas";
import { creatorsRouter } from "./creators";
import { scriptsRouter } from "./scripts";
import { calendarRouter } from "./calendar";
import { dashboardRouter } from "./dashboard";
import { adminRouter } from "./admin";
import { integrationsRouter } from "./integrations";

export const appRouter = createTRPCRouter({
  ideas: ideasRouter,
  creators: creatorsRouter,
  scripts: scriptsRouter,
  calendar: calendarRouter,
  dashboard: dashboardRouter,
  admin: adminRouter,
  integrations: integrationsRouter,
});

export type AppRouter = typeof appRouter;
