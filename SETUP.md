// ─────────────────────────────────────────────────────────────────────────────
// ContentForge — Local Setup Guide
// ─────────────────────────────────────────────────────────────────────────────

# Local Setup (Option A)

Follow these steps to get ContentForge running locally in ~15 minutes.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥20 | https://nodejs.org |
| pnpm | ≥8 | `npm i -g pnpm` |
| Git | any | https://git-scm.com |

---

## 1 — Clone & Install

```bash
git clone https://github.com/Flowintelli-AI/contentforge.git
cd contentforge
npm install
```

---

## 2 — Set Up Supabase (free tier, takes 2 min)

1. Go to https://supabase.com → New project
2. Note your **Project URL** and **Database password**
3. Go to **Project Settings → Database**
4. Copy the **Connection string (URI)** — it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[REF].supabase.co:5432/postgres
   ```

---

## 3 — Set Up Clerk (free tier)

1. Go to https://clerk.com → Create application
2. Copy **Publishable Key** and **Secret Key** from the API Keys page
3. In Clerk dashboard → **Webhooks** → Add endpoint:
   - URL: `https://your-domain.com/api/webhooks/clerk` (use ngrok for local)
   - Events: `user.created`, `user.updated`, `user.deleted`
4. Copy the **Signing Secret**

---

## 4 — Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
# Required to run
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
OPENAI_API_KEY="sk-proj-..."        # optional — mock works without it

# Leave the rest as-is for mock mode
```

---

## 5 — Run Database Migrations

```bash
cd packages/db
npx prisma generate
npx prisma migrate dev --name init
cd ../..
```

This creates all tables in your Supabase database.

---

## 6 — Start the Dev Server

```bash
npm run dev
```

Open http://localhost:3000 — you should see the ContentForge landing page.

---

## 7 — Verify Everything Works

| URL | Expected |
|-----|----------|
| http://localhost:3000 | Landing page |
| http://localhost:3000/sign-up | Clerk sign-up |
| http://localhost:3000/onboarding | Creator onboarding |
| http://localhost:3000/dashboard | Creator dashboard |
| http://localhost:3000/admin/review | Admin review queue |

---

## Integration Mock Mode

All integrations work in mock mode with no API keys:

| Integration | Mock behavior |
|-------------|---------------|
| Postiz | Returns fake post IDs, no actual scheduling |
| Opus Clip | Returns 2 mock clips after 3s |
| HeyGen | Returns a mock video URL after 5s |
| ElevenLabs | Returns a minimal MP3 base64 blob |
| ManyChat | Logs DMs/flows to console |
| Stripe | Redirects to successUrl immediately |
| OpenAI | Appends "[AI Refined]" prefix to idea |

---

## Webhook Testing (Local)

Use [ngrok](https://ngrok.com) to expose your local server for Clerk/Stripe webhooks:

```bash
ngrok http 3000
# Copy the https URL, e.g. https://abc123.ngrok.io
```

Update in Clerk dashboard and Stripe dashboard:
- Clerk webhook: `https://abc123.ngrok.io/api/webhooks/clerk`
- Stripe webhook: `https://abc123.ngrok.io/api/webhooks/stripe`

---

## Common Issues

| Issue | Fix |
|-------|-----|
| `DATABASE_URL` error | Check Supabase connection string — use pooler URL for serverless |
| Clerk redirect loop | Ensure `NEXT_PUBLIC_CLERK_*` vars are set |
| Prisma client not found | Run `npx prisma generate` in `packages/db/` |
| Port 3000 in use | `PORT=3001 npm run dev` |
