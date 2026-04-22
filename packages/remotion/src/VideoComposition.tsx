import { AbsoluteFill, OffthreadVideo, useVideoConfig, Sequence } from 'remotion';
import { CaptionOverlay, CaptionStyle, WordTiming } from './CaptionOverlay';

export interface VideoSegment {
  type: 'original' | 'heygen';
  src: string;        // URL to video file
  startFrom: number;  // seconds into the source video to start
  duration: number;   // seconds of this segment to show
  offsetFrom: number; // seconds from the beginning of the composition
  rotation?: number;  // EXIF rotation in degrees (0, 90, 180, 270) — apply CSS transform
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

        // For EXIF-rotated landscape videos (e.g. Samsung portrait: 1920×1080 + rotate:90),
        // Remotion ignores EXIF metadata and renders raw pixels. We must swap dimensions
        // and apply a CSS rotation so the video fills the portrait container correctly.
        const needs90Rotation = seg.rotation === 90 || seg.rotation === 270;
        const videoStyle = needs90Rotation
          ? {
              position: 'absolute' as const,
              top: '50%',
              left: '50%',
              // Swap dimensions: element is sized as landscape, then CSS-rotated to portrait
              width: '177.78%',   // container_height / container_width * 100% (1920/1080)
              height: '56.25%',   // container_width / container_height * 100% (1080/1920)
              transform: `translate(-50%, -50%) rotate(${seg.rotation}deg)`,
              objectFit: 'cover' as const,
            }
          : {
              position: 'absolute' as const,
              top: '50%',
              left: '50%',
              transform: seg.rotation === 180
                ? 'translate(-50%, -50%) rotate(180deg)'
                : 'translate(-50%, -50%)',
              width: '100%',
              height: '100%',
              objectFit: 'cover' as const,
              objectPosition: 'center center' as const,
            };

        return (
          <Sequence key={i} from={fromFrame} durationInFrames={durationFrames}>
            <AbsoluteFill style={{ overflow: 'hidden' }}>
              <OffthreadVideo
                src={seg.src}
                startFrom={startFromFrame}
                style={videoStyle}
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
