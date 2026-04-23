import { BRAND, SlideData } from '../brand';
import { SlideCounter, ProgressBar, HighlightedHeadline, FOOTER_BOTTOM } from './shared';

const W = BRAND.canvas.width;
const H = BRAND.canvas.height;
const PAD_L = BRAND.safe.left + 60;
const PAD_R = BRAND.safe.right + 40;
const CONTENT_W = W - PAD_L - PAD_R;
const STAT_W = Math.floor((CONTENT_W - 24) / 2);

/**
 * Adaptive font size for stat values — shorter values get bigger fonts.
 * Based on non-space character count to handle values like "11 hrs" or "2 weeks".
 */
function statFontSize(value: string): number {
  const chars = value.replace(/\s/g, '').length;
  if (chars <= 3) return 140;
  if (chars <= 5) return 100;
  return 80;
}

/** Single stat card — left-bordered column with value + label. */
function StatCard({ value, label }: { value: string; label: string }) {
  const cleanValue = value.replace(/[^\x00-\x7F]/g, '');
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: STAT_W,
        borderLeftWidth: 3,
        borderLeftStyle: 'solid',
        borderLeftColor: BRAND.colors.accent,
        paddingLeft: 24,
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      <span
        style={{
          fontFamily: BRAND.fonts.headline,
          fontSize: statFontSize(value),
          fontWeight: 800,
          color: BRAND.colors.accent,
          lineHeight: 1.0,
        }}
      >
        {cleanValue}
      </span>
      <span
        style={{
          fontFamily: BRAND.fonts.body,
          fontSize: 24,
          fontWeight: 500,
          color: BRAND.colors.textMuted,
          lineHeight: 1.4,
          marginTop: 8,
        }}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Slides 4–5 — Diagram: giant numbers dominate. No pill badges, no number circles.
 * - Single stat: 220px accent number fills the left column
 * - Multi-stat: 140px numbers in left-bordered rows
 * - Steps: cyan inline number + plain text, no cards
 */
export function DiagramSlide({
  slide,
  totalSlides,
}: {
  slide: SlideData;
  totalSlides: number;
}) {
  const steps = slide.steps ?? [];
  const stats = slide.stats ?? [];
  const hasSteps = steps.length > 0;
  const hasStats = stats.length > 0 && !hasSteps;
  const isSingleStat = hasStats && stats.length === 1;

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
          background: `linear-gradient(90deg, ${BRAND.colors.gradientStart}, ${BRAND.colors.gradientMid}, ${BRAND.colors.gradientEnd})`,
        }}
      />

      {/* Subtle background glow */}
      <div
        style={{
          position: 'absolute',
          top: 200,
          right: -80,
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 65%)',
        }}
      />

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          paddingTop: BRAND.safe.top + 16,
          paddingBottom: FOOTER_BOTTOM + 60,
          paddingLeft: PAD_L,
          paddingRight: PAD_R,
        }}
      >
        {/* Headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: CONTENT_W,
            marginBottom: 48,
          }}
        >
          <HighlightedHeadline
            text={slide.headline}
            fontSize={72}
            fontWeight={800}
            maxWidth={CONTENT_W}
            highlightWords={slide.highlight_word ? [slide.highlight_word] : undefined}
          />
        </div>

        {/* Steps — cyan number + plain text, no cards, no circles */}
        {hasSteps && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            {steps.map((step, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 28 }}
              >
                <span
                  style={{
                    fontFamily: BRAND.fonts.headline,
                    fontSize: 36,
                    fontWeight: 800,
                    color: BRAND.colors.accent,
                    lineHeight: 1.1,
                    flexShrink: 0,
                    minWidth: 40,
                  }}
                >
                  {String(i + 1)}
                </span>
                <span
                  style={{
                    fontFamily: BRAND.fonts.body,
                    fontSize: 30,
                    fontWeight: 500,
                    color: BRAND.colors.text,
                    lineHeight: 1.45,
                  }}
                >
                  {step}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Single stat — 220px dominates the slide */}
        {isSingleStat && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: BRAND.fonts.headline,
                fontSize: 220,
                fontWeight: 800,
                color: BRAND.colors.accent,
                lineHeight: 1.0,
              }}
            >
              {stats[0].value}
            </span>
            <span
              style={{
                fontFamily: BRAND.fonts.body,
                fontSize: 32,
                fontWeight: 500,
                color: BRAND.colors.textMuted,
                lineHeight: 1.4,
              }}
            >
              {stats[0].label}
            </span>
          </div>
        )}

        {/* Multi-stat — explicit 2-column rows (flexWrap unreliable in Satori) */}
        {hasStats && !isSingleStat && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* Row 1: stats[0] + stats[1] */}
            <div style={{ display: 'flex', gap: 24 }}>
              <StatCard value={stats[0].value} label={stats[0].label} />
              {stats.length > 1 && (
                <StatCard value={stats[1].value} label={stats[1].label} />
              )}
            </div>
            {/* Row 2: stats[2] + stats[3] (if present) */}
            {stats.length > 2 && (
              <div style={{ display: 'flex', gap: 24 }}>
                <StatCard value={stats[2].value} label={stats[2].label} />
                {stats.length > 3 && (
                  <StatCard value={stats[3].value} label={stats[3].label} />
                )}
              </div>
            )}
          </div>
        )}

        {/* Fallback — body text when no steps or stats */}
        {!hasSteps && !hasStats && slide.body && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              width: CONTENT_W,
            }}
          >
            <span
              style={{
                fontFamily: BRAND.fonts.body,
                fontSize: 40,
                fontWeight: 400,
                color: BRAND.colors.textMuted,
                lineHeight: 1.6,
                textAlign: 'center',
              }}
            >
              {slide.body}
            </span>
          </div>
        )}

        {/* Body text below steps/stats */}
        {(hasSteps || hasStats) && slide.body && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: CONTENT_W,
              marginTop: 32,
            }}
          >
            <span
              style={{
                fontFamily: BRAND.fonts.body,
                fontSize: 28,
                fontWeight: 400,
                color: BRAND.colors.textMuted,
                lineHeight: 1.55,
              }}
            >
              {slide.body}
            </span>
          </div>
        )}
      </div>

      <SlideCounter position={slide.position} total={totalSlides} />
      <ProgressBar position={slide.position} total={totalSlides} />
    </div>
  );
}
