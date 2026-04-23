import { BRAND, SlideData } from '../brand';
import { SlideCounter, ProgressBar, HighlightedHeadline, FOOTER_BOTTOM } from './shared';
import { LOGO_BASE64, MASCOT_POINTING } from '../assets';

const W = BRAND.canvas.width;
const H = BRAND.canvas.height;
const PAD_L = BRAND.safe.left + 60;
const PAD_R = BRAND.safe.right + 40;
const CONTENT_W = W - PAD_L - PAD_R;

/** Slide 1 — Hook: stop the scroll. Giant stat + headline fill the frame. */
export function HookSlide({
  slide,
  totalSlides,
  imageDataUri,
}: {
  slide: SlideData;
  totalSlides: number;
  imageDataUri?: string;
}) {
  const hasImage = !!imageDataUri;
  const hasHookStat = !!slide.hook_stat;
  const headlineFontSize = hasHookStat ? 88 : 116;

  // When hook_stat is shown as a giant number, strip it from the headline
  // so the same value doesn't appear twice (e.g. "73%" at 180px + in headline text).
  const rawHeadline = hasHookStat
    ? slide.headline
        .replace(slide.hook_stat!, '')
        .replace(/^[\s\-\u2013\u2014:,]+/, '')
        .trim()
    : slide.headline;

  // Satori uses Poppins TTF which has no emoji/non-ASCII glyphs — strip everything non-ASCII.
  const displayHeadline = rawHeadline.replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, ' ').trim();
  const cleanSubtext = (slide.subtext ?? '').replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, ' ').trim();

  const swipeText = (slide.swipe_invite ?? 'Swipe to see how >>')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Swipe to see how >>';

  return (
    <div
      style={{
        width: W,
        height: H,
        backgroundColor: BRAND.colors.bg,
        position: 'relative',
        display: 'flex',
      }}
    >
      {/* Layer 1 — full-bleed background image */}
      {hasImage && (
        <img
          src={imageDataUri}
          width={W}
          height={H}
          alt=""
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
      )}

      {/* Layer 2 — dark overlay so text stays legible */}
      {hasImage && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: W,
            height: H,
            backgroundColor: 'rgba(15, 23, 42, 0.78)',
          }}
        />
      )}

      {/* Decorative radial glows — only when no image */}
      {!hasImage && (
        <div
          style={{
            position: 'absolute',
            top: -80,
            left: -60,
            width: 480,
            height: 480,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 68%)',
          }}
        />
      )}
      {!hasImage && (
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            right: -40,
            width: 360,
            height: 360,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 68%)',
          }}
        />
      )}

      {/* Brand handle — top right, slide 1 only */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          right: BRAND.safe.right,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <img src={LOGO_BASE64} width={28} height={28} alt="" />
        <span
          style={{
            fontFamily: BRAND.fonts.body,
            fontSize: 24,
            fontWeight: 600,
            color: BRAND.colors.accent,
          }}
        >
          @flowintelli
        </span>
      </div>

      {/* Top gradient accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: 6,
          background: `linear-gradient(90deg, ${BRAND.colors.gradientStart}, ${BRAND.colors.gradientMid}, ${BRAND.colors.gradientEnd})`,
        }}
      />

      {/* Main content — stat + headline + subtext only; bottom row reserved for swipe+mascot */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          paddingTop: BRAND.safe.top,
          paddingBottom: FOOTER_BOTTOM + 290,
          paddingLeft: PAD_L,
          paddingRight: PAD_R,
          justifyContent: 'center',
        }}
      >
        {/* Hook stat — giant accent number (e.g. "73%", "10x") */}
        {hasHookStat && (
          <div style={{ display: 'flex', marginBottom: 8 }}>
            <span
              style={{
                fontFamily: BRAND.fonts.headline,
                fontSize: 180,
                fontWeight: 800,
                color: BRAND.colors.accent,
                lineHeight: 1.0,
              }}
            >
              {slide.hook_stat}
            </span>
          </div>
        )}

        {/* Headline — fills the frame; numbers auto-highlighted */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: CONTENT_W,
            marginBottom: 40,
          }}
        >
          <HighlightedHeadline
            text={displayHeadline}
            fontSize={headlineFontSize}
            fontWeight={800}
            maxWidth={CONTENT_W}
            highlightWords={slide.highlight_word ? [slide.highlight_word] : undefined}
          />
        </div>

        {/* Subtext */}
        {cleanSubtext && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: CONTENT_W - 60,
              marginBottom: 36,
            }}
          >
            <span
              style={{
                fontFamily: BRAND.fonts.body,
                fontSize: 38,
                fontWeight: 400,
                color: BRAND.colors.textMuted,
                lineHeight: 1.55,
              }}
            >
              {cleanSubtext}
            </span>
          </div>
        )}

      </div>

      {/* Bottom row — swipe invite (left) + mascot pointing right (robot "delivers" the invite) */}
      <div
        style={{
          position: 'absolute',
          bottom: FOOTER_BOTTOM + 10,
          left: PAD_L,
          width: W - PAD_L - 20,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Swipe text */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            justifyContent: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 32,
                height: 3,
                backgroundColor: BRAND.colors.accent,
                borderRadius: 2,
              }}
            />
            <span
              style={{
                fontFamily: BRAND.fonts.body,
                fontSize: 34,
                fontWeight: 500,
                color: BRAND.colors.textMuted,
              }}
            >
              {swipeText}
            </span>
          </div>
        </div>
        {/* Mascot — portrait 2:3, pointing toward the swipe direction */}
        <img src={MASCOT_POINTING} width={170} height={255} alt="" />
      </div>

      <SlideCounter position={slide.position} total={totalSlides} />
      <ProgressBar position={slide.position} total={totalSlides} />
    </div>
  );
}
