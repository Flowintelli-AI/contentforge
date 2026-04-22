import { Composition } from 'remotion';
import { VideoComposition, VideoCompositionProps } from './VideoComposition';

// Total duration is computed from segments at render time via inputProps
const DEFAULT_FPS = 30;
const DEFAULT_DURATION_FRAMES = 900; // 30s fallback; overridden by renderMediaOnLambda

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VideoComposition"
      component={VideoComposition}
      fps={DEFAULT_FPS}
      width={1080}
      height={1920}
      durationInFrames={DEFAULT_DURATION_FRAMES}
      defaultProps={
        {
          segments: [],
          wordTimings: [],
          captionStyle: 'KARAOKE',
          primaryColor: '#FFFFFF',
          highlightColor: '#FFD700',
        } satisfies VideoCompositionProps
      }
    />
  );
};
