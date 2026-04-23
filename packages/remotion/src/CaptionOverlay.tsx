import { useCurrentFrame, useVideoConfig, interpolate, AbsoluteFill } from 'remotion';

export type CaptionStyle = 'KARAOKE' | 'HIGHLIGHT' | 'CLEAN';

export interface WordTiming {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

interface Props {
  wordTimings: WordTiming[];
  captionStyle: CaptionStyle;
  primaryColor?: string;
  highlightColor?: string;
}

const SENTENCE_WINDOW = 6; // words visible at once for HIGHLIGHT/CLEAN

/**
 * Clamps each word's end time to the start of the next word.
 * ElevenLabs sometimes reports long end times that include trailing silence,
 * causing words to stay visible during pauses between phrases.
 */
function clampWordEnds(words: WordTiming[]): WordTiming[] {
  return words.map((w, i) => {
    const nextStart = words[i + 1]?.start;
    return nextStart !== undefined && nextStart < w.end
      ? { ...w, end: nextStart }
      : w;
  });
}

function groupIntoSentences(words: WordTiming[], windowSize: number): WordTiming[][] {
  const groups: WordTiming[][] = [];
  for (let i = 0; i < words.length; i += windowSize) {
    groups.push(words.slice(i, i + windowSize));
  }
  return groups;
}

export const CaptionOverlay: React.FC<Props> = ({
  wordTimings,
  captionStyle,
  primaryColor = '#FFFFFF',
  highlightColor = '#FFD700',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  if (!wordTimings || wordTimings.length === 0) return null;

  const clamped = clampWordEnds(wordTimings);

  if (captionStyle === 'KARAOKE') {
    return (
      <KaraokeCaption
        wordTimings={clamped}
        currentTime={currentTime}
        primaryColor={primaryColor}
        highlightColor={highlightColor}
      />
    );
  }

  if (captionStyle === 'HIGHLIGHT') {
    return (
      <HighlightCaption
        wordTimings={clamped}
        currentTime={currentTime}
        primaryColor={primaryColor}
        highlightColor={highlightColor}
        windowSize={SENTENCE_WINDOW}
      />
    );
  }

  return (
    <CleanCaption
      wordTimings={clamped}
      currentTime={currentTime}
      primaryColor={primaryColor}
      windowSize={SENTENCE_WINDOW}
      fps={fps}
      frame={frame}
    />
  );
};

// ── KARAOKE: one word at a time, bold pop ────────────────────────────────────
const KaraokeCaption: React.FC<{
  wordTimings: WordTiming[];
  currentTime: number;
  primaryColor: string;
  highlightColor: string;
}> = ({ wordTimings, currentTime, primaryColor, highlightColor }) => {
  const activeIdx = wordTimings.findIndex(
    (w) => currentTime >= w.start && currentTime <= w.end
  );
  if (activeIdx === -1) return null;
  // Show a 4-word window centered on active word
  const start = Math.max(0, activeIdx - 1);
  const visible = wordTimings.slice(start, start + 4);

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 120 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 12,
          maxWidth: '85%',
          rowGap: 4,
        }}
      >
        {visible.map((w, i) => {
          const isActive = currentTime >= w.start && currentTime <= w.end;
          return (
            <span
              key={`${w.word}-${start + i}`}
              style={{
                fontFamily: 'Inter, Arial Black, sans-serif',
                fontSize: isActive ? 60 : 52,
                fontWeight: isActive ? 900 : 700,
                color: isActive ? highlightColor : primaryColor,
                textShadow: isActive
                  ? '0 2px 16px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)'
                  : '0 2px 12px rgba(0,0,0,0.8)',
                letterSpacing: -1,
                lineHeight: 1.2,
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── HIGHLIGHT: sentence visible, current word glows ─────────────────────────
const HighlightCaption: React.FC<{
  wordTimings: WordTiming[];
  currentTime: number;
  primaryColor: string;
  highlightColor: string;
  windowSize: number;
}> = ({ wordTimings, currentTime, primaryColor, highlightColor, windowSize }) => {
  const sentences = groupIntoSentences(wordTimings, windowSize);
  const sentenceIdx = sentences.findIndex((s) =>
    currentTime >= s[0].start && currentTime <= s[s.length - 1].end
  );
  if (sentenceIdx === -1) return null;
  const sentence = sentences[sentenceIdx];

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 120 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 8,
          maxWidth: '85%',
          backgroundColor: 'rgba(0,0,0,0.45)',
          borderRadius: 16,
          padding: '12px 20px',
        }}
      >
        {sentence.map((w, i) => {
          const isActive = currentTime >= w.start && currentTime <= w.end;
          return (
            <span
              key={`${w.word}-${i}`}
              style={{
                fontFamily: 'Inter, Arial Black, sans-serif',
                fontSize: 46,
                fontWeight: 700,
                color: isActive ? highlightColor : primaryColor,
                textShadow: isActive
                  ? `0 0 20px ${highlightColor}, 0 2px 8px rgba(0,0,0,0.8)`
                  : '0 2px 8px rgba(0,0,0,0.8)',
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── CLEAN: sentence fades in, minimal style ──────────────────────────────────
const CleanCaption: React.FC<{
  wordTimings: WordTiming[];
  currentTime: number;
  primaryColor: string;
  windowSize: number;
  fps: number;
  frame: number;
}> = ({ wordTimings, currentTime, primaryColor, windowSize, fps, frame }) => {
  const sentences = groupIntoSentences(wordTimings, windowSize);
  const sentenceIdx = sentences.findIndex((s) =>
    currentTime >= s[0].start && currentTime <= s[s.length - 1].end
  );
  if (sentenceIdx === -1) return null;
  const sentence = sentences[sentenceIdx];

  const sentenceStartFrame = Math.round(sentence[0].start * fps);
  const opacity = interpolate(frame, [sentenceStartFrame, sentenceStartFrame + 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 120 }}>
      <div
        style={{
          opacity,
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 44,
          fontWeight: 600,
          color: primaryColor,
          textAlign: 'center',
          maxWidth: '80%',
          textShadow: '0 2px 16px rgba(0,0,0,0.9)',
          lineHeight: 1.3,
        }}
      >
        {sentence.map((w) => w.word).join(' ')}
      </div>
    </AbsoluteFill>
  );
};
