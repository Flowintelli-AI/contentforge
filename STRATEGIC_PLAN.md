# ContentForge — Freemium B2C Strategic Plan
**Flowintelli / github.com/Flowintelli-AI/contentforge**
*Research-based engineering specification — July 2025*

---

## Table of Contents

1. [Q1 — Audio/Music on Instagram & TikTok Carousels](#q1--audiomusic-on-instagram--tiktok-carousels)
2. [Q2 — Multi-Tenant "Post on Behalf of Users" Architecture](#q2--multi-tenant-post-on-behalf-of-users-architecture)
3. [Q3 — Per-User Carousel Customization](#q3--per-user-carousel-customization)
4. [Q4 — Freemium Business Model](#q4--freemium-business-model)
5. [Q5 — Technical Roadmap](#q5--technical-roadmap)

---

## Q1 — Audio/Music on Instagram & TikTok Carousels

### The Hard Truth: Instagram Carousel API Has Zero Audio Support

The Instagram Graph API `POST /<IG_ID>/media` with `media_type=CAROUSEL` accepts only image child containers. There is **no `audio_name`, `music_id`, or any audio-related parameter** in the carousel endpoint — confirmed directly from Meta's official API reference (July 2025). Carousels are image-only posts via API.

Furthermore, the Reels endpoint (`media_type=REELS`) explicitly states: **"Music tagging is only available for original audio."** This means even for Reels, you cannot attach a licensed Meta/Instagram trending song via an API call. The only audio Meta allows you to set programmatically is audio that is *already embedded in the video file you upload*.

**What this means for ContentForge:**
You have two viable paths for audio, and they are mutually exclusive:

| Path | Format | Audio Source | Effort |
|------|---------|-------------|--------|
| A — Keep carousel, no audio | `media_type=CAROUSEL` | None | Zero (current state) |
| B — Convert to Reel (slideshow video) | `media_type=REELS` | Embedded in MP4 | High (video pipeline) |
| C — TikTok photo posts with auto-music | TikTok Photo Post API | TikTok auto-selects | Low |

---

### Path A: Stay with Carousel (Recommended for v1)

Carousel posts on Instagram consistently outperform Reels for educational/informational content in terms of saves and profile reach (the algorithm re-shows carousels to users who didn't swipe through the first time). The lack of audio is not a real competitive disadvantage for the niche ContentForge is targeting — RSS-to-educational-carousel users are B2B creators, not entertainment creators.

**Verdict for v1:** Do not add audio. Keep carousel format. Audio/Reels is a v2+ feature.

---

### Path B: Convert Carousel to Reel (Slideshow Video)

If you decide to add music in a future version, the architecture is:

1. **Generate 10 PNG slides** (current pipeline — unchanged)
2. **Download royalty-free music** from a curated catalog (e.g., Pixabay Music API, Epidemic Sound, or your own `music-catalog.ts` file you already have at `src/lib/music-catalog.ts`)
3. **Stitch PNGs + audio into MP4** using `ffmpeg` (or the `remotion` library you already have installed at `src/lib/integrations/remotion/`)
4. **Upload MP4 to Azure Blob Storage** (public URL, <300 MB, H.264 + AAC)
5. **Create Reel container** via `publisher.ts`'s `createReelsContainer()` (already implemented) with `video_url` pointing to the blob URL
6. **Poll** `getContainerStatus()` until `FINISHED`, then `publishContainer()`

```
POST https://graph.instagram.com/v20.0/{IG_USER_ID}/media
  media_type=REELS
  video_url=https://flowintellistorage.blob.core.windows.net/reels/{runId}.mp4
  caption={caption}
  published=true
```

**Reel video specs (from Meta API reference):**
- Container: MP4, H.264 codec, AAC audio, 48kHz max, 1-2 channels
- Resolution: up to 1920×1080, recommended 9:16 (1080×1920)
- Duration: 3s – 15 min
- File size: ≤300 MB
- Frame rate: 23–60 FPS

**Note on aspect ratio:** Your current canvas is 1080×1350 (4:5), which is valid for carousel images. For Reels you'd switch to 1080×1920 (9:16). This requires a template redesign or a separate Reel template.

---

### Sourcing Trending Audio — What's Actually Possible

**Instagram trending audio — no official API.** There is no public Instagram endpoint to enumerate trending sounds. Options:

| Option | Reliability | Cost | Notes |
|--------|------------|------|-------|
| [TokBoard API](https://tokboard.com) | Medium | Paid | Tracks TikTok trending sounds; not Instagram-specific |
| [TrendTok](https://trendtok.app) | Medium | Paid | TikTok trend analytics API |
| Scraping Instagram Reels "Trending" | Low | Free | Violates Meta ToS — **do not use** |
| Curated royalty-free library | High | $0–$20/mo | Epidemic Sound, Pixabay Music (free), Bensound |
| AI-generated music | High | API cost | Suno API, Udio API — license-free |

**Practical recommendation:** Use your existing `music-catalog.ts` with a curated library of royalty-free tracks categorized by mood/niche (e.g., "tech", "finance", "health"). Let users pick a track category in their brand kit. This is more legally safe and controllable than trending sounds.

---

### TikTok: `auto_add_music: true` (Best Option for v2)

The **TikTok Content Posting API** for photo posts (`/v2/post/publish/content/init/`) supports:

```json
{
  "post_info": {
    "title": "5 AI Tools That Replace Your Team",
    "description": "Swipe to see each one 👉 #ai #productivity",
    "privacy_level": "PUBLIC_TO_EVERYONE",
    "disable_comment": false,
    "auto_add_music": true
  },
  "source_info": {
    "source": "PULL_FROM_URL",
    "photo_cover_index": 0,
    "photo_images": [
      "https://flowintellistorage.blob.core.windows.net/carousel-slides/run-001-slide-1.png",
      "https://flowintellistorage.blob.core.windows.net/carousel-slides/run-001-slide-2.png"
    ]
  },
  "post_mode": "DIRECT_POST",
  "media_type": "PHOTO"
}
```

With `auto_add_music: true`, TikTok automatically picks recommended (often trending) music for the photo carousel. **This is the closest thing to "trending music" programmatically available today.** No audio sourcing pipeline needed on your side.

Required TikTok scope: `video.publish`
Up to 35 photos per post, must pull from verified domain URLs (your Azure Blob Storage domain needs domain verification with TikTok).

---

### Make.com Native Module

The **Make.com Instagram module** (`Instagram > Create a Post`) does not expose an audio parameter for carousel posts — it maps directly to the Graph API with no extensions. You cannot add music to a carousel via Make.com either. For Reels, Make.com has a "Create a Reel" action, but again — you'd need to pre-embed audio in the video file before sending the URL to Make.com.

**Recommendation:** Replace Make.com posting with direct API calls from ContentForge Next.js (server action or tRPC mutation). Your `publisher.ts` is already implemented. Make.com adds latency and per-operation costs, and offers no value for posting that you can't do directly with the Graph API.

---

## Q2 — Multi-Tenant "Post on Behalf of Users" Architecture

### Instagram OAuth Scopes

ContentForge should use **Instagram Login** (the newer flow — `graph.instagram.com` host), not the legacy Facebook Login for Business path. This is simpler for end users (no Facebook Page required for Creator accounts).

**Required permissions:**
```
instagram_business_basic           — read user's profile, IG user ID
instagram_business_content_publish — create media containers + publish posts
instagram_business_manage_messages — needed only if you also want DM automation
```

If using the **older Facebook Login for Business** path (required for Business accounts with Pages):
```
instagram_basic
instagram_content_publish
pages_read_engagement
```
If the user granted their role via Business Manager, you also need `ads_management` or `ads_read`.

**Which path to use:** For ContentForge's B2C audience (individual creators/businesses), use **Instagram Login** (`graph.instagram.com`). It does not require a linked Facebook Page. For agency use cases (multiple business accounts), you'd eventually need Facebook Login for Business.

---

### OAuth Flow — Step-by-Step

```
1. User clicks "Connect Instagram" in ContentForge dashboard
   → Frontend redirects to:
   https://api.instagram.com/oauth/authorize
     ?client_id={IG_APP_ID}
     &redirect_uri=https://contentforge.app/api/auth/instagram/callback
     &scope=instagram_business_basic,instagram_business_content_publish
     &response_type=code
     &state={clerk_user_id | signed JWT to prevent CSRF}

2. Meta shows consent screen → user approves

3. Meta redirects to:
   /api/auth/instagram/callback?code=AQD...&state={state}

4. Backend: Exchange code for SHORT-LIVED token (1 hour):
   POST https://api.instagram.com/oauth/access_token
   Body (x-www-form-urlencoded):
     client_id={IG_APP_ID}
     client_secret={IG_APP_SECRET}
     grant_type=authorization_code
     redirect_uri=https://contentforge.app/api/auth/instagram/callback
     code={code}

   Response: { "access_token": "IGQ...", "user_id": "12345" }

5. Backend: Exchange SHORT-LIVED for LONG-LIVED token (~60 days):
   GET https://graph.instagram.com/access_token
     ?grant_type=ig_exchange_token
     &client_secret={IG_APP_SECRET}
     &access_token={short_lived_token}

   Response: { "access_token": "EAAg...", "token_type": "bearer", "expires_in": 5183944 }

6. Fetch user info:
   GET https://graph.instagram.com/me
     ?fields=id,username,name
     &access_token={long_lived_token}

7. Store in DB (see schema below), associate with Clerk userId.
```

---

### Long-Lived Token Refresh Pattern

Instagram long-lived tokens **expire after 60 days** but can be refreshed:

```
GET https://graph.instagram.com/refresh_access_token
  ?grant_type=ig_refresh_token
  &access_token={current_long_lived_token}
```

**Rules:**
- Can only refresh tokens that are **at least 24 hours old** and **not yet expired**
- Each refresh extends the token by another 60 days from the time of refresh
- Your existing `refreshLongLivedToken()` in `service.ts` already implements this correctly

**Recommended refresh strategy:** Run a Vercel Cron job (`/api/cron/refresh-tokens`) every 24 hours. Query all `social_connections` where `token_expires_at < NOW() + 10 days` and refresh them proactively. Never wait until expiry.

```typescript
// apps/web/src/app/api/cron/refresh-tokens/route.ts
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const tenDaysFromNow = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const expiring = await db.socialConnection.findMany({
    where: {
      platform: 'INSTAGRAM',
      tokenExpiresAt: { lt: tenDaysFromNow },
      status: 'ACTIVE',
    },
  });

  for (const conn of expiring) {
    try {
      const newToken = await refreshLongLivedToken(conn.accessToken);
      await db.socialConnection.update({
        where: { id: conn.id },
        data: {
          accessToken: encrypt(newToken),
          tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        },
      });
    } catch (err) {
      await db.socialConnection.update({
        where: { id: conn.id },
        data: { status: 'TOKEN_EXPIRED' },
      });
      // TODO: send user email notification
    }
  }

  return Response.json({ refreshed: expiring.length });
}
```

In `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/refresh-tokens", "schedule": "0 3 * * *" }
  ]
}
```

---

### Secure Token Storage in Next.js/Vercel

**Never store access tokens in plaintext.** Encrypt at rest using AES-256-GCM before writing to Postgres, decrypt on read.

```typescript
// apps/web/src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, 'hex'); // 32-byte hex key

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store as: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(stored: string): string {
  const [ivHex, authTagHex, cipherHex] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(cipherHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```

`TOKEN_ENCRYPTION_KEY` is a 64-char hex string (32 bytes). Generate once: `openssl rand -hex 32`. Store in Vercel environment variables as a secret. **Never commit it.**

---

### Meta App Review for `instagram_business_content_publish`

**What's required:**
1. Your Meta App must be in **Live mode** (not Development mode)
2. App must have a **Privacy Policy URL** and **Terms of Service URL** on a real domain
3. You must submit a **screencast video** (2-5 min) showing the full OAuth flow and publishing flow from a real user's perspective
4. You need a **test user** with a real Instagram Business or Creator account connected during review
5. Review typically takes **1–4 weeks**; complex apps (multi-user SaaS) are scrutinized more

**Difficulty level:** Medium. As long as your app clearly shows user consent, the content is not spammy, and you have real privacy/ToS pages, approval is achievable. ContentForge's use case (user connects their own account, posts their own carousel) is the cleanest possible scenario for Meta review.

**Critical:** In Development mode, only the Meta App's **Admin, Developer, or Tester** Facebook users can authenticate. To test with real users before review approval, add them as Testers in the Meta App dashboard.

---

### TikTok OAuth + Content Posting API

**OAuth scopes needed:**
- `video.publish` — direct post to user's TikTok (Direct Post mode)  
  OR
- `video.upload` — upload media for user to complete via TikTok inbox (MEDIA_UPLOAD mode)

For ContentForge's automated posting, use **`video.publish`**.

**Token lifecycle:**
```
access_token  → expires in 24 hours (86400 seconds)
refresh_token → expires in 365 days (31536000 seconds)
```

```typescript
// Exchange auth code for tokens
POST https://open.tiktokapis.com/v2/oauth/token/
Content-Type: application/x-www-form-urlencoded

client_key={TIKTOK_CLIENT_KEY}
&client_secret={TIKTOK_CLIENT_SECRET}
&code={authorization_code}
&grant_type=authorization_code
&redirect_uri=https://contentforge.app/api/auth/tiktok/callback

// Refresh access token (can run on cron every 23h)
POST https://open.tiktokapis.com/v2/oauth/token/
client_key={TIKTOK_CLIENT_KEY}
&client_secret={TIKTOK_CLIENT_SECRET}
&grant_type=refresh_token
&refresh_token={stored_refresh_token}
```

**TikTok Audit requirement:** Until your app passes TikTok's audit (`https://developers.tiktok.com/application/content-posting-api`), all content posted via `video.publish` is set to **private visibility** — users won't see it publicly. You must audit before going to production. The audit requires demonstrating legitimate use.

---

### Instagram Rate Limits Per User

| Limit | Value |
|-------|-------|
| API-published posts per 24h (all content types) | **100** |
| Carousel counts as | 1 post |
| Media containers per 24h | 400 |
| Stories per 24h (separate limit) | 25 |

For ContentForge's automated RSS→carousel flow, a user posting 1 carousel/day is well within limits. Even the most aggressive content creators (4–5 posts/day) are nowhere near the 100/day limit.

**ContentForge must also implement a soft limit** to protect users from accidental infinite loops (e.g., bug in RSS parsing that triggers 100 posts). Enforce a max of `10 API posts per user per 24h` at the application layer.

---

### Database Schema for Social Connections, Brand Kits, and Settings

```sql
-- ============================================================
-- SOCIAL CONNECTIONS (per-user OAuth tokens for each platform)
-- ============================================================
CREATE TABLE social_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,                    -- Clerk user ID
  platform        TEXT NOT NULL,                    -- 'INSTAGRAM' | 'TIKTOK' | 'LINKEDIN'
  platform_user_id TEXT NOT NULL,                   -- e.g., Instagram IG User ID
  platform_username TEXT,                           -- e.g., @handle
  access_token    TEXT NOT NULL,                    -- AES-256-GCM encrypted
  refresh_token   TEXT,                             -- encrypted; TikTok only
  token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,                   -- TikTok: 365 days
  status          TEXT NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | TOKEN_EXPIRED | REVOKED
  page_id         TEXT,                             -- Facebook Page ID (Instagram FB Login path)
  scopes          TEXT[],                           -- granted OAuth scopes
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform)                         -- one connection per platform per user (v1)
);

-- ============================================================
-- BRAND KITS (per-user branding configuration)
-- ============================================================
CREATE TABLE brand_kits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL UNIQUE,             -- Clerk user ID
  name            TEXT NOT NULL DEFAULT 'My Brand', -- display name

  -- Colors
  bg_primary      TEXT NOT NULL DEFAULT '#0f172a',  -- slide background
  bg_card         TEXT NOT NULL DEFAULT '#1e293b',  -- card/content block bg
  accent_color    TEXT NOT NULL DEFAULT '#06b6d4',  -- primary accent (cyan default)
  text_primary    TEXT NOT NULL DEFAULT '#f8fafc',
  text_muted      TEXT NOT NULL DEFAULT '#94a3b8',

  -- Typography
  font_family     TEXT NOT NULL DEFAULT 'Poppins',  -- must be in Azure Function font list
  font_url        TEXT,                             -- optional: custom Google Fonts URL

  -- Logo
  logo_url        TEXT,                             -- Cloudinary URL to user's logo
  logo_position   TEXT NOT NULL DEFAULT 'bottom-right', -- top-left | top-right | bottom-left | bottom-right

  -- Content preferences
  niche           TEXT,                             -- 'tech' | 'finance' | 'health' | 'marketing' | etc.
  handle          TEXT,                             -- @username shown in slides
  cta_text        TEXT DEFAULT 'Follow for more',   -- default CTA on slide 10

  -- Music preference (for future Reel/TikTok)
  music_mood      TEXT DEFAULT 'upbeat',            -- 'upbeat' | 'calm' | 'corporate' | 'energetic'

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RSS FEEDS (user's configured content sources)
-- ============================================================
CREATE TABLE rss_feeds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  url             TEXT NOT NULL,
  title           TEXT,                             -- resolved feed title
  niche           TEXT,                             -- override niche for this specific feed
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  last_article_guid TEXT,                           -- track last processed article to avoid duplicates
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, url)
);

-- ============================================================
-- CAROUSELS (generated carousel records)
-- ============================================================
CREATE TABLE carousels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  feed_id         UUID REFERENCES rss_feeds(id) ON DELETE SET NULL,
  article_url     TEXT,
  article_title   TEXT,
  slide_count     INT NOT NULL DEFAULT 10,
  slide_urls      TEXT[],                           -- Cloudinary URLs for each slide PNG
  pdf_url         TEXT,                             -- optional PDF version
  caption         TEXT,                             -- Instagram caption generated by GPT
  status          TEXT NOT NULL DEFAULT 'GENERATED', -- GENERATED | SCHEDULED | PUBLISHED | FAILED
  brand_kit_snapshot JSONB,                        -- snapshot of brand_kit at generation time
  gpt_cost_usd    DECIMAL(10,6),                   -- track AI cost per carousel
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SCHEDULED POSTS (queued carousel posts)
-- ============================================================
CREATE TABLE scheduled_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  carousel_id     UUID NOT NULL REFERENCES carousels(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,                    -- 'INSTAGRAM' | 'TIKTOK'
  scheduled_at    TIMESTAMPTZ NOT NULL,
  posted_at       TIMESTAMPTZ,
  platform_post_id TEXT,                            -- returned by platform after publish
  ig_container_id TEXT,                             -- Instagram container ID (for scheduled path)
  status          TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | PROCESSING | POSTED | FAILED
  error_message   TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USAGE TRACKING (for freemium quota enforcement)
-- ============================================================
CREATE TABLE usage_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  event_type      TEXT NOT NULL,                    -- 'CAROUSEL_GENERATED' | 'POST_PUBLISHED'
  platform        TEXT,
  credits_used    INT NOT NULL DEFAULT 1,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_events_user_month
  ON usage_events(user_id, created_at)
  WHERE created_at > NOW() - INTERVAL '31 days';
```

---

## Q3 — Per-User Carousel Customization

### Minimum Brand Fields

Based on analysis of Canva, Placid, and Predis.ai's brand kit systems, the minimum set that makes a carousel feel "owned" by a creator is:

| Field | Type | Why It Matters |
|-------|------|----------------|
| `bg_primary` | hex color | The dominant background color — biggest visual identifier |
| `accent_color` | hex color | Used for highlights, stat callouts, dividers |
| `logo_url` | image URL | Shows on every slide — most requested feature |
| `handle` | string | @username on slide footer — drives Instagram follows |
| `font_family` | enum | Typography is the #2 most visible brand signal |
| `cta_text` | string | Personalized CTA on slide 10 |

Secondary (v2):
- `bg_card` (inner card background)
- `text_primary`, `text_muted`
- `logo_position`
- `niche` (influences GPT prompt)
- `music_mood` (for future Reel/TikTok)

---

### How Canva / Placid Handle This

**Canva** uses a "Brand Hub" (Team plan only) that stores colors, fonts, and logos centrally. When a user opens a template, it offers to auto-apply brand colors. Templates are CSS-class-based — swapping color variables replaces all instances.

**Placid** uses a layer-based template editor. Each template layer (text, image, rectangle, shape) can have dynamic data bindings (`{{variable}}`). The API accepts a `modifications` array that overrides any layer property. For per-user branding, Placid customers typically have one template per brand and call the API with `modifications: [{ name: "bg", color: "#0f172a" }, { name: "logo", image_url: "..." }]`. The template system is visual and no-code.

**ContentForge's advantage:** Because you own the template code (JSX + Satori), you have more flexibility than Placid customers. You don't pay per-render API fees. You can deeply customize layouts programmatically based on brand kit in ways Placid's visual editor makes difficult.

---

### Satori Template Architecture for Per-User Branding

The key change is to make `BRAND` a **runtime parameter** instead of a compile-time constant.

**Step 1: Define `BrandKit` type** (add to `brand.ts`):

```typescript
// apps/carousel-renderer/src/brand.ts

export interface BrandKit {
  bgPrimary: string;       // e.g., '#0f172a'
  bgCard: string;          // e.g., '#1e293b'
  accentColor: string;     // e.g., '#06b6d4'
  textPrimary: string;     // e.g., '#f8fafc'
  textMuted: string;       // e.g., '#94a3b8'
  fontFamily: string;      // e.g., 'Poppins'
  logoUrl?: string;        // Cloudinary URL
  logoPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  handle?: string;         // '@yourhandle'
  ctaText?: string;        // 'Follow for more'
}

export const DEFAULT_BRAND_KIT: BrandKit = {
  bgPrimary: '#0f172a',
  bgCard: '#1e293b',
  accentColor: '#06b6d4',
  textPrimary: '#f8fafc',
  textMuted: '#94a3b8',
  fontFamily: 'Poppins',
  logoPosition: 'bottom-right',
  handle: '@contentforge',
  ctaText: 'Follow for more',
};
```

**Step 2: Thread `BrandKit` through the pipeline**:

```typescript
// pipeline.ts
export interface CarouselRenderOptions {
  input: CarouselInput;
  brandKit?: BrandKit;  // defaults to DEFAULT_BRAND_KIT if omitted
}

export async function generateCarouselPdf(
  options: CarouselRenderOptions
): Promise<CarouselRenderResult> {
  const brand = { ...DEFAULT_BRAND_KIT, ...(options.brandKit ?? {}) };
  // Pass brand to each template render
  const element = renderSlide(slide, input.slides.length, imageDataUri, brand);
  ...
}
```

**Step 3: Use `brand` props in templates instead of hardcoded constants**:

```typescript
// templates/hook.tsx (example)
export function HookSlide({ slide, brand }: { slide: SlideData; brand: BrandKit }) {
  return (
    <div
      style={{
        background: brand.bgPrimary,
        width: 1080,
        height: 1350,
        fontFamily: brand.fontFamily,
      }}
    >
      <div style={{ color: brand.accentColor, fontSize: 48 }}>
        {slide.hook_stat}
      </div>
      <div style={{ color: brand.textPrimary, fontSize: 64 }}>
        {slide.headline}
      </div>
      {/* Logo */}
      {brand.logoUrl && (
        <img
          src={brand.logoUrl}
          style={{
            position: 'absolute',
            width: 60,
            height: 60,
            objectFit: 'contain',
            ...(brand.logoPosition === 'bottom-right' && { bottom: 60, right: 80 }),
            ...(brand.logoPosition === 'bottom-left' && { bottom: 60, left: 80 }),
          }}
        />
      )}
    </div>
  );
}
```

**Step 4: Pass `brand_kit` in the Azure Function HTTP body**:

```typescript
// Azure Function request body (new schema)
interface CarouselFunctionRequest {
  article_url?: string;
  article_title?: string;
  article_body?: string;
  rss_feed_url?: string;
  user_id: string;           // NEW: for auth + usage tracking
  brand_kit?: BrandKit;      // NEW: per-user brand
  post_immediately?: boolean; // NEW: trigger posting after render
  platforms?: ('instagram' | 'tiktok')[]; // NEW: where to post
}
```

---

### BrandKit Storage in Database

The `brand_kits` table (defined in Q2 schema above) stores the canonical brand kit. When a carousel is generated, take a **snapshot** of the brand kit at that moment (stored as `brand_kit_snapshot JSONB` in the `carousels` table). This ensures historical carousels look as they were when generated, even if the user later changes their brand.

---

### Font Support in Azure Function

Satori requires fonts to be loaded as binary data. Currently `getFonts()` loads Poppins. To support per-user font choices, maintain a **font registry** in the Function:

```typescript
// fonts.ts — supported font families
const SUPPORTED_FONTS = ['Poppins', 'Inter', 'Roboto', 'Merriweather', 'Playfair Display', 'Lato'];

export async function getFonts(fontFamily: string = 'Poppins') {
  // Load the requested font family (regular + bold variants)
  // Fonts cached as Buffer in module scope to avoid re-downloading
}
```

Pre-bundle the top 5–6 font families in the Azure Function's `fonts/` directory (they're already small TTF files). Do not support arbitrary Google Fonts URLs in v1 — too slow and complex.

---

## Q4 — Freemium Business Model

### Placid.app Actual Pricing (Researched July 2025)

Placid does not prominently display per-plan credits on their public pricing page — they use a credit-based system with these tiers (from their FAQ):
- **1 image = 1 credit**
- **10s video = 10 credits**
- **1 PDF page = 2 credits**
- Unused credits roll over (up to 2× monthly allowance)
- No overage fees — generation stops at limit
- Plans approximately: ~€19/mo (500 credits), ~€39/mo (3,000 credits), ~€79/mo (7,000 credits)

**Placid's limitations as a direct competitor to ContentForge:**
1. Placid is a **rendering API** — it doesn't generate content. You still need Make.com + RSS parser + GPT + Placid + Instagram module = 5+ tools
2. Placid has no social posting integration — it only produces image URLs
3. Placid templates require manual Placid editor work per brand
4. No concept of "RSS feed" or automatic content pipeline

**ContentForge's positioning:** You're not just a rendering API — you're the entire pipeline from RSS/URL → AI content → branded slides → auto-posted. This is worth significantly more.

---

### Competitor Landscape

| Tool | Price | What it does | ContentForge advantage |
|------|-------|-------------|----------------------|
| **Placid.app** | ~$19–79/mo | Image generation API, no posting | Full automation pipeline |
| **Predis.ai** | $19–212/mo | AI social content + carousel + auto-post | RSS automation, cheaper |
| **Taplio** | $32–149/mo | LinkedIn only, carousel builder | Multi-platform, Instagram-native |
| **Canva** | $15/mo | Design tool, manual work | Zero-click automation |
| **Adobe Express** | $10/mo | Design tool, manual work | Zero-click automation |
| **Simplified** | $18–40/mo | AI post + carousel, auto-post | RSS source, cheaper |
| **Publer / Buffer / Later** | $12–18/mo | Scheduling only, no content gen | Content generation built-in |
| **Postly** | $15/mo | Scheduling + basic AI | RSS→carousel specific |

**Predis.ai is the most direct competitor.** Their Core plan at $19/mo gives 1,300 credits (enough for ~65 AI-generated carousels), 1 brand, and **no auto-posting** (manual post only). Rise at $40/mo adds auto-posting but with only 3,200 credits. ContentForge can undercut on price and lead on automation.

---

### Willingness to Pay

Based on the competitive set, the market has established these price anchors:
- **Free tier** is expected — Predis, Simplified, Canva, Buffer all have free tiers
- **~$15–20/mo** for basic automation (1-3 connected accounts, limited monthly volume)
- **~$35–50/mo** for full automation with scheduling and multi-platform
- **$100+/mo** for agencies/teams with multiple brands

The user who replaces **Placid ($30/mo) + Make.com ($9–16/mo) + some GPT API cost (~$5/mo)** = **~$50–60/month total stack** will happily pay $29–39/mo for ContentForge that does it all natively.

---

### Suggested Pricing Tiers

#### Free — "Creator Starter"
**$0/month** — no credit card required
- 5 AI carousels per month
- 1 brand kit
- 1 connected platform (Instagram OR TikTok)
- Download slides as PNG (watermarked)
- Manual post button only (no auto-scheduling)
- ContentForge watermark on slide 10

**Goal:** Viral loop via watermark, low conversion barrier, prove value in 5 carousels.

---

#### Pro — "Creator Pro"
**$19/month** ($190/year — 2 months free)
- **30 AI carousels per month** (~1/day)
- **2 brand kits**
- **2 connected platforms** (Instagram + TikTok)
- Auto-scheduling (post at optimal time)
- RSS feed → auto-generate + post (fully hands-free)
- No watermark
- Slide PNG + PDF download
- Caption + hashtag generation included
- Priority carousel rendering (Azure Function dedicated capacity)

**This directly replaces:** Placid ($19–39/mo) + Make.com ($9/mo) + GPT API (~$3/mo) = **$31–51/mo replaced for $19/mo.**

---

#### Growth — "Brand Builder"
**$39/month** ($390/year)
- **100 AI carousels per month**
- **5 brand kits** (agencies, multi-niche creators)
- **4 connected platforms** (Instagram, TikTok, LinkedIn, Pinterest - roadmap)
- Up to 3 RSS feeds per brand
- Optimal time analytics (see when your audience is online)
- Carousel A/B testing (2 variants, pick winner automatically)
- White-label PDF exports
- Priority email support

---

#### Agency — "White Label"
**$99/month** ($990/year)
- **Unlimited carousels** (fair use: ~500/mo)
- **Unlimited brand kits**
- **Unlimited connected accounts**
- Subdomain white-labeling (client-facing portal at `yourname.contentforge.app`)
- Client management dashboard
- API access (REST endpoint to trigger carousel generation programmatically)
- Dedicated onboarding call

---

### Minimal Feature Set for a Genuinely Attractive Free Tier

To convert free users to paid, they must experience the "magic moment" (first fully auto-posted carousel) on the free plan. This means:
1. ✅ **Real AI carousel generation** (not demo/preview) — 5 carousels is enough to experience value
2. ✅ **One-click posting** to their connected Instagram — even manual, the end-to-end flow must work
3. ✅ **Basic brand kit** (at minimum: accent color + handle + font choice) — so it feels like theirs
4. ❌ No RSS auto-trigger on free — that's the core Pro unlock
5. ❌ Watermark on slide 10 — drives brand awareness + upgrade motivation

---

## Q5 — Technical Roadmap

### Current State Inventory

```
✅ Azure Function: RSS article → GPT-4o-mini → Satori slides → Cloudinary CDN
✅ Hardcoded BRAND constants (brand.ts)
✅ Next.js app with Clerk auth (contentforge/apps/web)
✅ Make.com scenario for Instagram posting
✅ Instagram publisher.ts (Reels scheduled/immediate) — not used for carousel posting yet
✅ Instagram service.ts (token refresh, DM, comment reply)
✅ tRPC instagram.ts router (getConnection, saveConnection, refreshToken, disconnect)
✅ IgConnection DB model (via igConnection.upsert — already in Prisma schema)
❌ No per-user brand_kit in Azure Function
❌ No OAuth callback routes for Instagram or TikTok
❌ No carousel-specific publisher (current publisher only handles Reels video)
❌ No RSS feed management UI or database table
❌ No scheduling system for carousel posts
❌ No freemium usage tracking / quota enforcement
❌ No CI/CD for Azure Function (manual deploy only)
```

---

### What Changes in the Azure Function

**1. Accept `brand_kit` in request body:**

```typescript
// src/functions/generateCarousel.ts (HTTP trigger)
export default async function generateCarousel(request: HttpRequest): Promise<HttpResponseInit> {
  const body = await request.json() as {
    article_url?: string;
    article_title: string;
    article_body: string;
    user_id: string;
    brand_kit?: BrandKit;
  };

  const brandKit = body.brand_kit ?? DEFAULT_BRAND_KIT;

  const carouselInput = await articleToCarousel(
    body.article_title,
    body.article_body,
    process.env.OPENAI_API_KEY!
  );

  const result = await generateCarouselPdf({
    input: carouselInput,
    brandKit,
  });

  // Optionally accept a callback_url to POST result to ContentForge webhook
  if (body.callback_url) {
    await fetch(body.callback_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Secret': process.env.CALLBACK_SECRET! },
      body: JSON.stringify({ user_id: body.user_id, ...result }),
    });
  }

  return { status: 200, jsonBody: result };
}
```

**2. Add `user_id` to Azure Function — for future rate limiting and logging (the function shouldn't do DB calls directly; use the callback pattern above).**

**3. Font loading: pre-bundle fonts, load from `./fonts/` directory relative to function. Already works per your `setup-fonts.ps1`.**

---

### New API Routes Needed in Next.js App

```
POST /api/auth/instagram/connect     → Initiate Instagram OAuth (redirect to Meta)
GET  /api/auth/instagram/callback    → Handle OAuth callback, store long-lived token
POST /api/auth/tiktok/connect        → Initiate TikTok OAuth
GET  /api/auth/tiktok/callback       → Handle TikTok OAuth callback
GET  /api/cron/refresh-tokens        → Vercel Cron: refresh expiring tokens (daily)
POST /api/webhooks/carousel-done     → Callback from Azure Function when carousel is ready
POST /api/carousels/generate         → Trigger carousel generation (calls Azure Function)
POST /api/carousels/[id]/post        → Post a generated carousel immediately
POST /api/carousels/[id]/schedule    → Schedule a carousel for a future time
GET  /api/carousels/[id]/status      → Check post status
```

**OAuth callback implementation** (Instagram, abbreviated):

```typescript
// apps/web/src/app/api/auth/instagram/callback/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // must verify against stored state (CSRF)

  // 1. Validate state
  // 2. Exchange code for short-lived token
  const shortTokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/instagram/callback`,
      code: code!,
    }),
  });
  const { access_token: shortToken, user_id: igUserId } = await shortTokenRes.json();

  // 3. Exchange for long-lived token
  const longTokenRes = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${shortToken}`
  );
  const { access_token: longToken, expires_in } = await longTokenRes.json();

  // 4. Get username
  const userRes = await fetch(
    `https://graph.instagram.com/me?fields=id,username&access_token=${longToken}`
  );
  const { username } = await userRes.json();

  // 5. Store encrypted token in DB
  await db.socialConnection.upsert({
    where: { userId_platform: { userId: clerkUserId, platform: 'INSTAGRAM' } },
    create: {
      userId: clerkUserId,
      platform: 'INSTAGRAM',
      platformUserId: igUserId,
      platformUsername: username,
      accessToken: encrypt(longToken),
      tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      status: 'ACTIVE',
    },
    update: { /* same fields */ },
  });

  return Response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?connected=instagram`);
}
```

---

### Scheduling Architecture

Instagram natively supports scheduled posts via the Graph API (up to 75 days out). This eliminates the need for a custom queue for the scheduling feature.

```typescript
// When user schedules a carousel:
const containerId = await createCarouselContainer(accessToken, igUserId, slideUrls, caption);
// Wait for status = FINISHED (~10-30s, poll with exponential backoff)
// Then schedule:
await fetch(`https://graph.instagram.com/${igUserId}/media`, {
  method: 'POST',
  body: new URLSearchParams({
    media_type: 'CAROUSEL',
    children: containerIds.join(','),
    caption,
    published: 'false',
    scheduled_publish_time: String(Math.floor(scheduledAt.getTime() / 1000)),
    access_token: accessToken,
  }),
});
```

For "optimal time" posting (Pro feature), maintain a `posting_analytics` table tracking engagement by day-of-week and hour for each user's connected account. Default to well-researched optimal times (Tuesday–Thursday, 8–10am or 6–8pm in user's local timezone) until you have enough data.

For posts that need Vercel-side scheduling (e.g., multi-platform synchronization, or if Instagram native scheduling fails), use **Vercel Cron** at 5-minute granularity:

```typescript
// vercel.json
{
  "crons": [
    { "path": "/api/cron/dispatch-scheduled-posts", "schedule": "*/5 * * * *" }
  ]
}
```

```typescript
// /api/cron/dispatch-scheduled-posts/route.ts
// Find all scheduled_posts WHERE scheduled_at <= NOW() AND status = 'PENDING'
// For each: trigger the carousel posting pipeline, update status to PROCESSING
```

---

### Recommended Database Schema Changes

Your existing Prisma schema has `IgConnection`, `CreatorProfile`, `User`, etc. The additions needed for the multi-tenant carousel SaaS are in the SQL schema defined in Q2. In Prisma terms:

```prisma
model SocialConnection {
  id                String    @id @default(cuid())
  userId            String    // Clerk user ID
  platform          Platform  // INSTAGRAM | TIKTOK | LINKEDIN
  platformUserId    String
  platformUsername  String?
  accessToken       String    // encrypted
  refreshToken      String?   // encrypted; TikTok only
  tokenExpiresAt    DateTime
  refreshExpiresAt  DateTime?
  status            ConnStatus @default(ACTIVE)
  pageId            String?
  scopes            String[]
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@unique([userId, platform])
}

model BrandKit {
  id             String   @id @default(cuid())
  userId         String   @unique
  name           String   @default("My Brand")
  bgPrimary      String   @default("#0f172a")
  bgCard         String   @default("#1e293b")
  accentColor    String   @default("#06b6d4")
  textPrimary    String   @default("#f8fafc")
  textMuted      String   @default("#94a3b8")
  fontFamily     String   @default("Poppins")
  logoUrl        String?
  logoPosition   String   @default("bottom-right")
  handle         String?
  ctaText        String   @default("Follow for more")
  niche          String?
  musicMood      String   @default("upbeat")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model RssFeed {
  id             String     @id @default(cuid())
  userId         String
  url            String
  title          String?
  niche          String?
  isActive       Boolean    @default(true)
  lastFetchedAt  DateTime?
  lastArticleGuid String?
  carousels      Carousel[]
  createdAt      DateTime   @default(now())

  @@unique([userId, url])
}

model Carousel {
  id                  String    @id @default(cuid())
  userId              String
  feedId              String?
  feed                RssFeed?  @relation(fields: [feedId], references: [id])
  articleUrl          String?
  articleTitle        String?
  slideCount          Int       @default(10)
  slideUrls           String[]  // Cloudinary URLs
  pdfUrl              String?
  caption             String?
  status              CarouselStatus @default(GENERATED)
  brandKitSnapshot    Json?
  gptCostUsd          Decimal?  @db.Decimal(10, 6)
  scheduledPosts      ScheduledPost[]
  createdAt           DateTime  @default(now())
}

model ScheduledPost {
  id               String    @id @default(cuid())
  userId           String
  carouselId       String
  carousel         Carousel  @relation(fields: [carouselId], references: [id], onDelete: Cascade)
  platform         Platform
  scheduledAt      DateTime
  postedAt         DateTime?
  platformPostId   String?
  igContainerId    String?
  status           PostStatus @default(PENDING)
  errorMessage     String?
  retryCount       Int        @default(0)
  createdAt        DateTime   @default(now())
}

model UsageEvent {
  id           String   @id @default(cuid())
  userId       String
  eventType    String   // CAROUSEL_GENERATED | POST_PUBLISHED
  platform     String?
  creditsUsed  Int      @default(1)
  metadata     Json?
  createdAt    DateTime @default(now())

  @@index([userId, createdAt])
}
```

---

### 5 Highest-Leverage Features to Build First

Ranked by (user value × technical feasibility × moat):

#### 🥇 1. Per-User Brand Kit + Branded Carousel Generation (Week 1–2)

**Why first:** This is the fundamental product differentiation. Without it, you're just a demo. Every user who registers should immediately see their brand colors/logo/handle in their carousel.

**Scope:**
- Add `brand_kits` table and Prisma model
- Build `BrandKit` onboarding UI (color picker, logo upload to Cloudinary, font chooser, handle input)
- Update Azure Function to accept + apply `brand_kit` param
- Thread through tRPC → API route → Azure Function call

**Time estimate:** 3–4 days

---

#### 🥈 2. Instagram OAuth Connect + Carousel Carousel Publisher (Week 2–3)

**Why second:** This is the "magic moment" — user sees their branded carousel actually posted to Instagram. Without this, ContentForge is just a slide generator.

**Scope:**
- `/api/auth/instagram/connect` + `/api/auth/instagram/callback` routes
- New `SocialConnection` model (replace/extend existing `IgConnection`)
- Carousel publish function: `publishCarouselToInstagram(carouselId, userId)`
  - Creates 10 image containers → waits for FINISHED → creates carousel container → publishes
- "Post Now" button on carousel preview page

**Time estimate:** 4–5 days

---

#### 🥉 3. RSS Feed Management + Automatic Generation Trigger (Week 3–4)

**Why third:** This is the core "replace Make.com" feature. Users add their RSS feed URL, and ContentForge polls it (Vercel Cron every hour), detects new articles, generates a carousel, and queues it for posting. This is the feature nobody else does end-to-end.

**Scope:**
- `rss_feeds` table + Prisma model
- RSS feed UI: add/remove/activate feeds
- `/api/cron/poll-rss` (hourly Vercel Cron): fetches feeds, detects new articles via `last_article_guid`, triggers Azure Function, stores resulting carousel
- Webhook from Azure Function → `/api/webhooks/carousel-done` → update carousel status + trigger auto-post or queue

**Time estimate:** 4–5 days

---

#### 4. Freemium Usage Tracking + Stripe Upgrade Gate (Week 4–5)

**Why fourth:** You need this before going public. Without quotas + payment, you have no business model — just a free tool burning Azure compute and OpenAI credits.

**Scope:**
- `usage_events` table
- Middleware to check quota before each carousel generation: `checkCarouselQuota(userId)` → throws if over free limit (5/month)
- Stripe checkout for Pro plan ($19/mo) using your existing Stripe integration (`src/lib/integrations/stripe/`)
- Webhook: `customer.subscription.created/updated/deleted` → update `users.plan` field
- UI: quota progress bar on dashboard, "Upgrade to Pro" gate modal

**Time estimate:** 3–4 days

---

#### 5. Carousel Scheduling with Optimal Time Suggestion (Week 5–6)

**Why fifth:** The scheduling feature is what separates ContentForge from "I could build this in Make.com" — it makes the product feel like a proper social media manager.

**Scope:**
- `scheduled_posts` table
- "Schedule for later" UI on carousel preview (date/time picker with timezone)
- "Use optimal time" button (suggests best time based on niche defaults: Tue–Thu 8am/7pm local)
- `/api/cron/dispatch-scheduled-posts` (every 5 min Vercel Cron): finds due scheduled posts, posts them
- Instagram native scheduling path: set `published=false` + `scheduled_publish_time` at container creation

**Time estimate:** 3–4 days

---

### CI/CD for Azure Function

Currently manual (`func azure functionapp publish`). Add GitHub Actions:

```yaml
# .github/workflows/deploy-carousel-renderer.yml
name: Deploy Carousel Renderer

on:
  push:
    branches: [main]
    paths:
      - 'apps/carousel-renderer/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
        working-directory: apps/carousel-renderer

      - name: Build
        run: npm run build
        working-directory: apps/carousel-renderer

      - name: Deploy to Azure Functions
        uses: Azure/functions-action@v1
        with:
          app-name: 'contentforge-carousel'
          slot-name: 'Production'
          package: 'apps/carousel-renderer'
          publish-profile: ${{ secrets.AZURE_FUNCTIONAPP_PUBLISH_PROFILE }}
          scm-do-build-during-deployment: false
          enable-oryx-build: false
```

Store `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` as a GitHub secret (download from Azure Portal → Function App → "Get publish profile").

---

### Consolidated Build Sequence (6-Week Sprint)

```
Week 1:  Brand Kit (schema + UI + Azure Function integration)
Week 2:  Instagram OAuth + Carousel Publisher
Week 3:  RSS Feed Management + Auto-generation Cron
Week 4:  Freemium Quota + Stripe Upgrade Gate
Week 5:  Scheduling + Optimal Time
Week 6:  TikTok OAuth + Photo Post API + CI/CD + Beta launch
```

**After week 6, you have:**
- A fully functional freemium SaaS
- RSS → AI carousel → branded slides → auto-posted to Instagram (and optionally TikTok)
- Stripe billing with Free/Pro tiers
- Per-user brand kits
- Posting scheduler

This is a legitimate Placid + Make.com replacement at a lower price point, with a fully automated content pipeline that competitors don't offer.

---

## Summary: Critical Path

```
1. TOKEN_ENCRYPTION_KEY → generate and store in Vercel + Azure env vars NOW
2. Meta App → submit for instagram_business_content_publish review NOW (takes weeks)
3. TikTok App → submit Content Posting API audit request NOW
4. Brand Kit UI → build Week 1 (unblocks everything)
5. Instagram OAuth → build Week 2 (enables the magic moment)
6. RSS + Cron → build Week 3 (the core "wow" feature)
7. Stripe quota → build Week 4 (enables monetization)
```

The biggest non-engineering risk is **Meta App Review** — submit it the day you start Week 2 development, even before the feature is fully complete. Use a test account to make the screencast. Review can proceed in parallel with development.

---

*Document generated July 2025 — ContentForge Strategic Plan v1.0*
*Sources: Meta Graph API docs (developers.facebook.com), TikTok for Developers docs (developers.tiktok.com), Placid.app pricing page, Predis.ai pricing page, Taplio pricing page*
