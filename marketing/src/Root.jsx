import { Composition } from 'remotion';
import { CreativityPromo } from './CreativityPromo';
import { W, H, FPS, TOTAL } from './theme';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="CreativityPromo"
        component={CreativityPromo}
        durationInFrames={TOTAL}
        fps={FPS}
        width={W}
        height={H}
      />
    </>
  );
};
