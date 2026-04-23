// Shared slide components — imported by all templates
//
// Rule 8 — @marketingharry patterns (Hrabren Lindfors, 141K+ Threads followers):
//   1. Typography fills the slide — headline IS the visual (180–300px equivalent, scaled to our canvas)
//   2. ONE dominant statement per slide — 4–8 words, declarative, present tense
//   3. ONE accent-colored NUMBER per headline — numeric tokens auto-highlighted in cyan
//   4. ZERO decorative pill badges on inner slides — remove noise, let type speak
//   5. Psychological open-loop: each slide creates tension resolved by the next
//   6. Progress bar = mechanical "keep going" signal — never omit it
//   7. BIG NUMBERS always — if a stat exists, render it massive (140–220px)
//   8. "SAVE THIS POST" explicit trigger on CTA — direct instruction drives saves
//   9. Flowintelli adaptation: dark navy + cyan replaces yellow + black — same contrast principle

import { BRAND } from '../brand';
import { LOGO_BASE64 } from '../assets';

const W = BRAND.canvas.width;
const PAD_L = BRAND.safe.left + 60;

export const FOOTER_BOTTOM = 220;

/** Shared footer: slide counter (left) + logo + brand name (right) */
export function SlideFooter({ position, total }: { position: number; total: number }) {
  const num = String(position).padStart(2, '0');
  const tot = String(total).padStart(2, '0');
  return (
    <div
      style={{
        position: 'absolute',
        bottom: FOOTER_BOTTOM - 18,
        left: 0,
        width: W,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: PAD_L,
        paddingRight: BRAND.safe.right,
      }}
    >
      <span
        style={{
          fontFamily: BRAND.fonts.body,
          fontSize: 24,
          fontWeight: 500,
          color: BRAND.colors.textMuted,
        }}
      >
        {`${num} / ${tot}`}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src={LOGO_BASE64} width={36} height={36} alt="" />
        <span
          style={{
            fontFamily: BRAND.fonts.body,
            fontSize: 22,
            fontWeight: 700,
            color: BRAND.colors.accent,
          }}
        >
          Flowintelli
        </span>
      </div>
    </div>
  );
}

/** Gradient progress bar at the absolute bottom of the slide */
export function ProgressBar({ position, total }: { position: number; total: number }) {
  const filledWidth = Math.round((position / total) * W);
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: W,
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        display: 'flex',
      }}
    >
      <div
        style={{
          width: filledWidth,
          height: 6,
          background: `linear-gradient(90deg, ${BRAND.colors.gradientStart}, ${BRAND.colors.gradientMid}, ${BRAND.colors.gradientEnd})`,
        }}
      />
    </div>
  );
}

/** Slide counter + swipe nudge — for middle slides 2–9 */
export function SlideCounter({ position, total }: { position: number; total: number }) {
  const num = String(position).padStart(2, '0');
  const tot = String(total).padStart(2, '0');
  return (
    <div
      style={{
        position: 'absolute',
        bottom: FOOTER_BOTTOM - 18,
        left: PAD_L,
        right: BRAND.safe.right,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          fontFamily: BRAND.fonts.body,
          fontSize: 24,
          fontWeight: 500,
          color: BRAND.colors.textMuted,
        }}
      >
        {`${num} / ${tot}`}
      </span>
      <span
        style={{
          fontFamily: BRAND.fonts.body,
          fontSize: 22,
          fontWeight: 600,
          color: BRAND.colors.accent,
        }}
      >
        {'swipe >>'}
      </span>
    </div>
  );
}

/**
 * Highlights numeric tokens AND any words in the optional highlightWords array (cyan accent).
 * Strips non-ASCII before rendering so Poppins TTF doesn't show glyph boxes.
 */
export function HighlightedHeadline({
  text,
  fontSize,
  fontWeight,
  maxWidth,
  highlightWords,
}: {
  text: string;
  fontSize: number;
  fontWeight: number;
  maxWidth: number;
  highlightWords?: string[];
}) {
  const clean = text.replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ');
  const wordSpacing = Math.round(fontSize * 0.28);
  const normalizedHighlights = (highlightWords ?? []).map(h =>
    h.toLowerCase().replace(/[^a-z0-9]/g, '')
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', width: maxWidth }}>
      {words.map((word, i) => {
        const isNumeric = /^\d+[\w%xX.]*$/.test(word);
        const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isHighlighted =
          isNumeric ||
          (normalizedHighlights.length > 0 && normalizedHighlights.includes(normalized));
        return (
          <span
            key={i}
            style={{
              fontFamily: BRAND.fonts.headline,
              fontSize,
              fontWeight,
              color: isHighlighted ? BRAND.colors.accent : BRAND.colors.text,
              lineHeight: 1.12,
              marginRight: i < words.length - 1 ? wordSpacing : 0,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}
