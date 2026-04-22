import { AbsoluteFill, OffthreadVideo, useVideoConfig, Sequence } from 'remotion';
import { CaptionOverlay, CaptionStyle, WordTiming } from './CaptionOverlay';

export interface VideoSegment {
  type: 'original' | 'heygen';
  src: string;        // URL to video file
  startFrom: number;  // seconds into the source video to start
  duration: number;   // seconds of this segment to show
  offsetFrom: number; // seconds from the beginning of the composition
}

export interface VideoCompositionProps {
  segments: VideoSegment[];
  wordTimings: WordTiming[];
  captionStyle: CaptionStyle;
  primaryColor?: string;
  highlightColor?: string;
}

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  segments,
  wordTimings,
  captionStyle,
  primaryColor = '#FFFFFF',
  highlightColor = '#FFD700',
}) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {segments.map((seg, i) => {
        const fromFrame = Math.round(seg.offsetFrom * fps);
        const durationFrames = Math.round(seg.duration * fps);
        const startFromFrame = Math.round(seg.startFrom * fps);

        return (
          <Sequence key={i} from={fromFrame} durationInFrames={durationFrames}>
            <AbsoluteFill style={{ overflow: 'hidden' }}>
              <OffthreadVideo
                src={seg.src}
                startFrom={startFromFrame}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center center',
                }}
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      <CaptionOverlay
        wordTimings={wordTimings}
        captionStyle={captionStyle}
        primaryColor={primaryColor}
        highlightColor={highlightColor}
      />
    </AbsoluteFill>
  );
};
