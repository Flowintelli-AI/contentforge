import { BRAND, BrandTheme, SlideData } from '../brand';
import { SlideCounter, ProgressBar, HighlightedHeadline, FOOTER_BOTTOM } from './shared';

const W = BRAND.canvas.width;
const H = BRAND.canvas.height;
const PAD_L = BRAND.safe.left + 60;
const PAD_R = BRAND.safe.right + 40;
const CONTENT_W = W - PAD_L - PAD_R;

/**
 * Slides 6–9 — Practical / Recap.
 * Layout: [label + headline] anchored top, [body + bullets] anchored bottom via space-between.
 * Fills all 1124px of content height — no dead space.
 */
export function PracticalSlide({
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
  const stepNum = slide.position - 5; // slides 6-9 → steps 1-4
  const isRecap = slide.position === 9;
  const label = isRecap ? 'RECAP' : `STEP ${stepNum}`;
  const bullets = slide.bullets ?? [];
  const hasBottomContent = !!slide.body || bullets.length > 0 || !!slide.teaser;

  return (
    <div
      style={{
        width: W,
        height: H,
        backgroundColor: BRAND.colors.bg,
        display: 'flex',
        flexDirection: 'column',
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
          height: 5,
          background: `linear-gradient(90deg, ${th.gradientStart}, ${th.gradientMid}, ${th.gradientEnd})`,
        }}
      />

      {/* Subtle glow */}
      <div
        style={{
          position: 'absolute',
          bottom: 160,
          left: -60,
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 65%)',
        }}
      />

      {/* Main content — space-between fills full 1124px height */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          paddingTop: BRAND.safe.top + 16,
          paddingBottom: FOOTER_BOTTOM + 100,
          paddingLeft: PAD_L,
          paddingRight: PAD_R,
          justifyContent: 'flex-start',
        }}
      >
        {/* TOP: label + headline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', marginBottom: 32 }}>
            <span
              style={{
                fontFamily: BRAND.fonts.body,
                fontSize: 22,
                fontWeight: 600,
                color: th.accent,
                letterSpacing: 3,
              }}
            >
              {label}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', width: CONTENT_W }}>
            <HighlightedHeadline
              text={slide.headline}
              fontSize={96}
              fontWeight={800}
              maxWidth={CONTENT_W}
              highlightWords={slide.highlight_word ? [slide.highlight_word] : undefined}
              brand={brand}
            />
          </div>
        </div>

        {/* SPACER — expands between headline and body, minimum breathing room */}
        {hasBottomContent && <div style={{ display: 'flex', flex: 1 }} />}

        {/* BOTTOM: body + bullets — floats above footer */}
        {hasBottomContent && (
          <div style={{ display: 'flex', flexDirection: 'column', width: CONTENT_W }}>
            {slide.body && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  marginBottom: bullets.length > 0 ? 36 : 0,
                }}
              >
                <span
                  style={{
                    fontFamily: BRAND.fonts.body,
                    fontSize: 44,
                    fontWeight: 400,
                    color: BRAND.colors.textMuted,
                    lineHeight: 1.65,
                  }}
                >
                  {slide.body}
                </span>
              </div>
            )}

            {bullets.map((bullet, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 28,
                  marginBottom: i < bullets.length - 1 ? 40 : (slide.teaser ? 36 : 0),
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: th.accent,
                    flexShrink: 0,
                    marginTop: 20,
                  }}
                />
                <span
                  style={{
                    fontFamily: BRAND.fonts.body,
                    fontSize: 42,
                    fontWeight: 400,
                    color: BRAND.colors.text,
                    lineHeight: 1.5,
                  }}
                >
                  {bullet}
                </span>
              </div>
            ))}

            {/* Teaser — inside flex content so it never overlaps footer */}
            {slide.teaser && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <div
                  style={{
                    width: 24,
                    height: 2,
                    backgroundColor: th.accent,
                    borderRadius: 1,
                  }}
                />
                <span
                  style={{
                    fontFamily: BRAND.fonts.body,
                    fontSize: 22,
                    fontWeight: 500,
                    color: BRAND.colors.textMuted,
                  }}
                >
                  {slide.teaser}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <SlideCounter position={slide.position} total={totalSlides} brand={brand} />
      <ProgressBar position={slide.position} total={totalSlides} brand={brand} />
    </div>
  );
}
