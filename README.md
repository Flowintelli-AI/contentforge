# ContentForge

> Turn 1 hour of recording into 30 days of content. AI-powered content creation platform for UGC creators.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui |
| API | tRPC (type-safe end-to-end) |
| Database | PostgreSQL via Prisma ORM (Supabase or Neon) |
| Auth | Clerk |
| Background Jobs | Trigger.dev |
| AI | OpenAI GPT-4o |
| Scheduling | Postiz (self-hosted) |
| Video Repurposing | Opus Clip |
| AI Video | HeyGen |
| AI Voice | ElevenLabs |
| Comment Automation | ManyChat |
| Payments | Stripe |
| Analytics | PostHog |
| Monorepo | Turborepo |

## Project Structure

```
contentforge/
├── apps/
│   └── web/                  # Next.js app
│       ├── src/
│       │   ├── app/          # App Router pages
│       │   │   ├── page.tsx             # Landing page
│       │   │   ├── onboarding/          # Creator onboarding flow
│       │   │   ├── dashboard/           # Main creator dashboard
│       │   │   │   ├── ideas/           # Idea intake
│       │   │   │   ├── scripts/         # Script library
│       │   │   │   ├── videos/          # Video upload + clips
│       │   │   │   ├── calendar/        # Content calendar
│       │   │   │   ├── automations/     # Comment/DM automations
│       │   │   │   └── blog/            # Blog center
│       │   │   └── api/                 # API routes + webhooks
│       │   ├── server/
│       │   │   ├── trpc.ts              # tRPC init + context
│       │   │   └── routers/             # tRPC routers
│       │   │       ├── ideas.ts
│       │   │       ├── scripts.ts
│       │   │       ├── videos.ts
│       │   │       ├── calendar.ts
│       │   │       ├── automations.ts
│       │   │       └── creators.ts
│       │   ├── lib/
│       │   │   ├── trpc/                # tRPC client + provider
│       │   │   └── utils.ts
│       │   ├── components/
│       │   │   └── ui/                  # shadcn/ui components
│       │   └── hooks/
├── packages/
│   ├── db/
│   │   └── prisma/schema.prisma         # Full DB schema
│   ├── ai/
│   │   └── src/agents/
│   │       ├── scriptWriter.ts          # GPT-4o script generation
│   │       ├── trendAnalyst.ts          # Trend analysis agent
│   │       └── contentStrategist.ts     # Idea refinement agent
│   ├── integrations/
│   │   └── src/
│   │       ├── postiz.ts                # Scheduling
│   │       ├── opusclip.ts              # Video repurposing
│   │       ├── stripe.ts                # Payments
│   │       ├── heygen.ts                # AI avatar videos
│   │       └── elevenlabs.ts            # AI voice cloning
│   └── jobs/
│       └── src/
│           ├── generateScript.ts        # Async script generation
│           └── repurposeVideo.ts        # Async clip generation
└── .env.example
```

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy env vars
cp .env.example .env
# Fill in DATABASE_URL, OPENAI_API_KEY, Clerk keys, Stripe keys

# 3. Generate Prisma client + push schema
npm run db:push

# 4. Start dev server
npm run dev
```

## Environment Variables

See `.env.example` for all required variables.

## MVP Subscription Tiers

| Tier | Price | Features |
|------|-------|---------|
| Basic | $49/mo | 25 scripts/mo, idea intake, script library |
| Growth | $99/mo | Unlimited scripts, repurposing, calendar, scheduling |
| Premium | $199/mo | Everything + AI avatar/voice, automations, blog engine |

## Roadmap

### Phase 1 — MVP (Now)
- [x] Onboarding flow + niche selection
- [x] Idea submission → AI script generation
- [x] Script library + admin review
- [x] Postiz scheduling integration
- [ ] Video upload + Opus Clip repurposing
- [ ] Content calendar

### Phase 2 — Automation
- [ ] Comment keyword automations (ManyChat)
- [ ] DM workflow builder
- [ ] Multi-platform distribution automation
- [ ] Analytics dashboard

### Phase 3 — Advanced AI
- [ ] HeyGen AI avatar video generation
- [ ] ElevenLabs voice cloning
- [ ] Blog engine (AI article from script)
- [ ] Influencer trend analysis
- [ ] White-label creator portal
