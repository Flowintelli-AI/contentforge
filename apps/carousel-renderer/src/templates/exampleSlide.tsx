import { BRAND, SlideData } from '../brand';
import { SlideCounter, ProgressBar, HighlightedHeadline, FOOTER_BOTTOM } from './shared';

const W = BRAND.canvas.width;
const H = BRAND.canvas.height;
const PAD_L = BRAND.safe.left + 60;
const PAD_R = BRAND.safe.right + 40;
const CONTENT_W = W - PAD_L - PAD_R;

/** Adaptive headline font: fewer words → larger font, fills more vertical space. */
function headlineFontSize(text: string): number {
  const words = text.trim().split(/\s+/).length;
  if (words <= 4) return 96;
  if (words <= 6) return 80;
  return 68;
}

/**
 * Slides 2–3 — Example.
 * Layout: headline anchored top, body+bullets anchored bottom via space-between.
 * Fills all 1124px of content height — no dead space.
 */
export function ExampleSlide({
  slide,
  totalSlides,
  imageDataUri,
}: {
  slide: SlideData;
  totalSlides: number;
  imageDataUri?: string;
}) {
  const hasImage = !!imageDataUri;
  const bullets = slide.bullets ?? [];
  const hasBottomContent = !!slide.body || bullets.length > 0;

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
      {hasImage && (
        <img
          src={imageDataUri}
          width={W}
          height={H}
          alt=""
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
      )}
      {hasImage && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: W,
            height: H,
            backgroundColor: 'rgba(15, 23, 42, 0.82)',
          }}
        />
      )}

      {/* Top gradient accent bar */}
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

      {/* Left edge accent stripe — no image only */}
      {!hasImage && (
        <div
          style={{
            position: 'absolute',
            top: BRAND.safe.top,
            left: 0,
            width: 4,
            height: H - BRAND.safe.top - BRAND.safe.bottom,
            background: `linear-gradient(180deg, ${BRAND.colors.gradientStart}, ${BRAND.colors.gradientEnd})`,
          }}
        />
      )}

      {/* Main content — space-between fills full 1124px */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          paddingTop: BRAND.safe.top + 16,
          paddingBottom: FOOTER_BOTTOM + 80,
          paddingLeft: PAD_L,
          paddingRight: PAD_R,
          justifyContent: hasBottomContent ? 'flex-start' : 'center',
        }}
      >
        {/* TOP: headline — large, numbers auto-highlighted */}
        <div style={{ display: 'flex', flexDirection: 'column', width: CONTENT_W }}>
          <HighlightedHeadline
            text={slide.headline}
            fontSize={headlineFontSize(slide.headline)}
            fontWeight={800}
            maxWidth={CONTENT_W}
            highlightWords={slide.highlight_word ? [slide.highlight_word] : undefined}
          />
        </div>

        {/* SPACER — expands between headline and body to space them naturally */}
        {hasBottomContent && <div style={{ display: 'flex', flex: 1 }} />}

        {/* BOTTOM: body + bullets — always at least paddingBottom above footer */}
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
                  marginBottom: i < bullets.length - 1 ? 40 : 0,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: BRAND.colors.accent,
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
          </div>
        )}
      </div>

      <SlideCounter position={slide.position} total={totalSlides} />
      <ProgressBar position={slide.position} total={totalSlides} />
    </div>
  );
}
