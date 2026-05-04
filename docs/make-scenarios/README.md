# Make.com Scenario Blueprints

Reference exports of all Make.com scenarios powering the carousel pipeline.
These are documentation/recovery artifacts — the live scenarios are managed in Make.com.

## Files

| File | Platform | Status | Notes |
|------|----------|--------|-------|
| `flowintelli-linkedin-reference.json` | LinkedIn | Reference only | Original flow — LinkedIn API approval pending |
| `flowintelli-instagram-v1.json` | Instagram | **Active** | Export from Make.com and save here |

## How to export a scenario blueprint from Make.com

1. Open Make.com → your scenario
2. Click the **three-dot menu (⋮)** in the top-right
3. Select **Export Blueprint**
4. Save the downloaded JSON into this folder

## How to import (restore or clone) a scenario

1. Make.com → **Create a new scenario**
2. Click the **three-dot menu (⋮)** → **Import Blueprint**
3. Upload the JSON file
4. Re-connect any app connections (Instagram, HTTP) — credentials are not exported

## Scenario Flow (both platforms)

```
RSS App (watch feed)
  ↓ new article
HTTP POST → Azure Function /api/generatecarousel
  body: { article_title, article_body, platform, brand? }
  ↓ returns { slides_png_urls[], caption, platform_fitness }
[Platform-specific posting steps]
  ↓ Instagram: multi-image carousel via Graph API
  ↓ LinkedIn: PDF document upload via UGC Posts API
```

## Azure Function endpoint

- URL: `https://flowintelli-carousel.azurewebsites.net/api/generatecarousel`
- Auth: `x-api-key` header (stored in Make.com HTTP module, not in this file)
- Tag: `carousel-renderer-v1.0` (stable reference)
