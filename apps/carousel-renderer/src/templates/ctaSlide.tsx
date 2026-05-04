import { BRAND, BrandTheme, SlideData } from '../brand';
import { ProgressBar, HighlightedHeadline, FOOTER_BOTTOM } from './shared';
import { LOGO_BASE64, MASCOT_CELEBRATING } from '../assets';

const W = BRAND.canvas.width;
const H = BRAND.canvas.height;
const PAD_L = BRAND.safe.left + 60;
const PAD_R = BRAND.safe.right + 40;
const CONTENT_W = W - PAD_L - PAD_R;

/**
 * Adaptive font size so the quoted keyword never overflows CONTENT_W=810px.
 * Poppins 800 uppercase avg advance ≈ 0.78em; each curly quote ≈ 0.38em.
 * Target max width: 760px (25px safety margin each side).
 */
function keywordFontSize(word: string): number {
  const raw = Math.floor(760 / (word.length * 0.78 + 0.76));
  return Math.min(148, raw);
}

/**
 * Slide 10 — CTA: full-height 3-section layout inspired by @marketingharry.
 *
 *  TOP    — challenge headline from GPT (fills ~25% of slide)
 *  MIDDLE — Comment → "KEYWORD" → and I will send you → benefit
 *  BOTTOM — gradient divider + logo circle + Flowintelli branding
 */
export function CtaSlide({
  slide,
  totalSlides,
  brand,
}: {
  slide: SlideData;
  totalSlides: number;
  brand?: BrandTheme;
}) {
  const th = {
    accent:        brand?.accent        ?? BRAND.colors.accent,
    gradientStart: brand?.gradientStart ?? BRAND.colors.gradientStart,
    gradientMid:   brand?.gradientMid   ?? BRAND.colors.gradientMid,
    gradientEnd:   brand?.gradientEnd   ?? BRAND.colors.gradientEnd,
  };
  const isDefaultBrand = !brand || brand.name === 'Flowintelli';
  const keyword = slide.cta_comment_prompt ?? 'AUTOMATE';
  const benefit = slide.action ?? 'the full automation playbook';
  const kwSize = keywordFontSize(keyword);

  return (
    <div
      style={{
        width: W,
        height: H,
        backgroundColor: BRAND.colors.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {/* Top gradient bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: 6,
          background: `linear-gradient(90deg, ${th.gradientStart}, ${th.gradientMid}, ${th.gradientEnd})`,
        }}
      />

      {/* Subtle radial glow behind keyword */}
      <div
        style={{
          position: 'absolute',
          top: H * 0.3,
          left: W / 2 - 300,
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(6,182,212,0.09) 0%, transparent 65%)`,
        }}
      />

      {/* 3-section layout fills full height */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: W,
          flex: 1,
          paddingTop: BRAND.safe.top + 30,
          paddingBottom: FOOTER_BOTTOM + 16,
          paddingLeft: PAD_L,
          paddingRight: PAD_R,
          justifyContent: 'space-between',
        }}
      >
        {/* ── SECTION 1: Challenge headline (left-aligned, large) ── */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', marginBottom: 20 }}>
            <div
              style={{
                width: 48,
                height: 4,
                backgroundColor: th.accent,
                borderRadius: 2,
              }}
            />
          </div>
          <HighlightedHeadline
            text={slide.headline}
            fontSize={76}
            fontWeight={800}
            maxWidth={CONTENT_W}
            highlightWords={slide.highlight_word ? [slide.highlight_word] : undefined}
            brand={brand}
          />
        </div>

        {/* ── SECTION 2: Comment trigger (centered) ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* "Comment" */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <span
              style={{
                fontFamily: BRAND.fonts.body,
                fontSize: 48,
                fontWeight: 400,
                color: BRAND.colors.textMuted,
              }}
            >
              Comment
            </span>
          </div>

          {/* KEYWORD — adaptive size, never overflows */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              width: CONTENT_W,
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontFamily: BRAND.fonts.headline,
                fontSize: kwSize,
                fontWeight: 800,
                color: th.accent,
                lineHeight: 1.0,
              }}
            >
              {`\u201c${keyword}\u201d`}
            </span>
          </div>

          {/* "and I will send you" */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <span
              style={{
                fontFamily: BRAND.fonts.body,
                fontSize: 40,
                fontWeight: 400,
                color: BRAND.colors.textMuted,
              }}
            >
              and I will send you
            </span>
          </div>

          {/* Benefit */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              width: CONTENT_W,
            }}
          >
            <span
              style={{
                fontFamily: BRAND.fonts.body,
                fontSize: 44,
                fontWeight: 700,
                color: BRAND.colors.text,
                lineHeight: 1.3,
              }}
            >
              {benefit}
            </span>
          </div>
        </div>

        {/* ── SECTION 3: Brand footer (centered) ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Gradient divider */}
          <div
            style={{
              width: 100,
              height: 3,
              borderRadius: 2,
              background: `linear-gradient(90deg, ${th.gradientStart}, ${th.gradientMid})`,
              marginBottom: 28,
            }}
          />

          {/* Logo — gradient ring with dark inner circle so logo is always visible */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 144,
              height: 144,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${th.gradientStart}, ${th.gradientMid})`,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 108,
                height: 108,
                borderRadius: '50%',
                backgroundColor: BRAND.colors.bg,
              }}
            >
              {isDefaultBrand
                ? <img src={LOGO_BASE64} width={82} height={82} alt="" />
                : <span style={{ fontFamily: BRAND.fonts.headline, fontSize: 32, fontWeight: 800, color: th.accent }}>{brand?.name ?? 'Brand'}</span>
              }
            </div>
          </div>

          {/* Wordmark removed — logo + website only */}
          <div style={{ display: 'flex' }}>
            <span
              style={{
                fontFamily: BRAND.fonts.body,
                fontSize: 22,
                fontWeight: 400,
                color: BRAND.colors.textMuted,
              }}
            >
              {brand?.website ?? 'flowintelli.com'}
            </span>
          </div>
        </div>
      </div>

      {/* Mascot — bottom-right, celebrating alongside the brand circle (portrait 2:3) */}
      <img
        src={MASCOT_CELEBRATING}
        width={150}
        height={225}
        alt=""
        style={{ position: 'absolute', bottom: FOOTER_BOTTOM - 40, right: 20 }}
      />

      <ProgressBar position={slide.position} total={totalSlides} brand={brand} />
    </div>
  );
}
