import { createTRPCRouter } from "@/server/trpc";
import { ideasRouter } from "./ideas";
import { creatorsRouter } from "./creators";
import { scriptsRouter } from "./scripts";
import { calendarRouter } from "./calendar";
import { dashboardRouter } from "./dashboard";
import { adminRouter } from "./admin";
import { integrationsRouter } from "./integrations";
import { billingRouter } from "./billing";
import { automationsRouter } from "./automations";
import { instagramRouter } from "./instagram";
import { videosRouter } from "./videos";

export const appRouter = createTRPCRouter({
  ideas: ideasRouter,
  creators: creatorsRouter,
  scripts: scriptsRouter,
  calendar: calendarRouter,
  dashboard: dashboardRouter,
  admin: adminRouter,
  integrations: integrationsRouter,
  billing: billingRouter,
  automations: automationsRouter,
  instagram: instagramRouter,
  videos: videosRouter,
});

export type AppRouter = typeof appRouter;
