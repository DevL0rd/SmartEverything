import type { ReactNode } from 'react';
import { useState } from 'react';
import { useColour } from '../../../design/colour';
import { Canvas } from '../parts/frame';
import { useInk, useTint } from '../parts/ink';
import { MicrowaveBody } from '../parts/microwave-body';
import { CavityLight, Turntable } from '../parts/microwave-cavity';
import { CountdownRing, FinishGlow, FinishSteam, ModeEffect } from '../parts/microwave-effects';
import { finishPlays, microwaveDisplay, type MicrowaveDisplay } from '../model/microwave-display';
import type { VisualProps } from '../types';

function useFinishPlays(display: MicrowaveDisplay, playing: boolean): boolean {
  const [seen, setSeen] = useState(display.finishedAt);
  if (!playing && seen !== display.finishedAt) {
    setSeen(display.finishedAt);
  }
  return finishPlays(seen, display, playing);
}

interface Colours {
  readonly warm: string;
  readonly positive: string;
}

function useColours(): Colours {
  return { warm: useColour('temp-warm'), positive: useColour('positive') };
}

function Detail({
  display,
  size,
  px,
  tint,
  warm,
  moving,
}: Pick<VisualProps, 'size' | 'px' | 'moving'> & {
  readonly display: MicrowaveDisplay;
  readonly tint: string;
  readonly warm: string;
}): ReactNode {
  const ink = useInk();
  const hot = useColour('critical');
  const fresh = useColour('info');
  const track = useColour('outline-variant');
  const spinning = moving && display.phase === 'running';
  return (
    <>
      <Turntable ink={ink} tint={tint} px={px} spinning={spinning} />
      {display.effect === null ? null : (
        <ModeEffect
          effect={display.effect}
          warm={warm}
          hot={hot}
          fresh={fresh}
          ink={ink}
          moving={moving}
          px={px}
        />
      )}
      {display.progress === null || size === 'tile' ? null : (
        <CountdownRing
          progress={display.progress}
          colour={warm}
          track={track}
          paused={display.phase === 'paused'}
          size={size === 'hero' ? 'hero' : 'card'}
          px={px}
        />
      )}
    </>
  );
}

function Finish({
  display,
  playing,
  px,
  positive,
}: {
  readonly display: MicrowaveDisplay;
  readonly playing: boolean;
  readonly px: number;
  readonly positive: string;
}): ReactNode {
  const steam = useColour('on-surface');
  const finishing = useFinishPlays(display, playing);
  if (!finishing) {
    return null;
  }
  return (
    <>
      <FinishGlow colour={positive} px={px} />
      <FinishSteam colour={steam} px={px} />
    </>
  );
}

export function MicrowaveVisual({
  state,
  size,
  px,
  tone,
  moving,
  reduced,
}: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useTint('temp-warm', tone);
  const { warm, positive } = useColours();
  const display = microwaveDisplay(state);
  const playing = moving && state.online;
  return (
    <>
      <Canvas px={px} layer>
        <MicrowaveBody
          ink={ink}
          glow={tint}
          positive={positive}
          display={display}
          size={size}
          lit={display.lit}
          warm={warm}
        />
      </Canvas>
      <CavityLight colour={warm} px={px} lit={display.lit} reduced={reduced} />
      {size === 'tile' ? null : (
        <Detail display={display} size={size} px={px} tint={tint} warm={warm} moving={moving} />
      )}
      <Finish display={display} playing={playing} px={px} positive={positive} />
    </>
  );
}
