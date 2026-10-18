import type { ReactNode } from 'react';
import { css } from 'react-native-reanimated';
import { Path } from 'react-native-svg';
import { BREATHE, SPIN, drift, loopStyle, rise } from '../../../design/loops';
import type { MicrowaveEffect } from '../model/microwave-display';
import { Canvas, Layer } from './frame';
import type { VisualInk } from './ink';
import { CAVITY, RING, RING_LENGTH, WELL } from './microwave-geometry';

const FINISH_FLASH = css.keyframes({
  '0%': { opacity: 0 },
  '30%': { opacity: 0.4 },
  '100%': { opacity: 0 },
});

const WAVES = 'M26 42q14-8 28 0M22 48q18-10 36 0M18 54q22-12 44 0';
const WAVE_MS = 1800;
const GRILL_BAR = 'M18 31.6H62a1.3 1.3 0 0 1 0 2.6H18a1.3 1.3 0 0 1 0-2.6Z';
const GRILL_GLOW = 'M18 31.6H62V40H18Z';
const GRILL_MS = 2400;
const FAN_RING = 'M47 40a7 7 0 1 0 -14 0a7 7 0 1 0 14 0';
const FAN_BLADES =
  'M40 40c-1-5 2-7 4-6-1 3-2 5-4 6ZM40 40c5-1 7 2 6 4-3-1-5-2-6-4ZM40 40c1 5-2 7-4 6 1-3 2-5 4-6ZM40 40c-5 1-7-2-6-4 3 1 5 2 6 4Z';
const FAN_MS = 1200;
const SHIMMER = 'M26 66q-2-4 0-8t0-8M40 66q-2-4 0-8t0-8M54 66q-2-4 0-8t0-8';
const SHIMMER_MS = 2400;
const SHIMMER_RISE = 0.06;
const STEAM_BOX = { x: 8, y: 4, w: 40, h: 18 } as const;
const STEAM =
  'M14 16a4 2.4 0 1 0 8 0a4 2.4 0 1 0 -8 0M23 13a4 2.4 0 1 0 8 0a4 2.4 0 1 0 -8 0M32 16a4 2.4 0 1 0 8 0a4 2.4 0 1 0 -8 0';
const STEAM_RISE = 0.08;
const STEAM_MS = 2600;
const FLASH_MS = 2000;

function Waves({ colour, moving, px }: Props): ReactNode {
  return (
    <Layer
      box={CAVITY}
      px={px}
      motion={loopStyle({ name: BREATHE, ms: WAVE_MS, alternate: true }, moving)}
    >
      <Canvas px={px} box={CAVITY}>
        <Path
          d={WAVES}
          stroke={colour}
          strokeOpacity={0.55}
          strokeWidth={1.4}
          strokeLinecap="round"
          fill="none"
        />
      </Canvas>
    </Layer>
  );
}

function Grill({ colour, moving, px }: Props): ReactNode {
  return (
    <Layer
      box={CAVITY}
      px={px}
      motion={loopStyle({ name: BREATHE, ms: GRILL_MS, alternate: true }, moving)}
    >
      <Canvas px={px} box={CAVITY}>
        <Path d={GRILL_GLOW} fill={colour} fillOpacity={0.14} />
        <Path d={GRILL_BAR} fill={colour} fillOpacity={0.9} />
      </Canvas>
    </Layer>
  );
}

function Shimmer({ colour, moving, px }: Props): ReactNode {
  return (
    <Layer
      box={CAVITY}
      px={px}
      motion={loopStyle(
        { name: drift(Math.round(px * SHIMMER_RISE)), ms: SHIMMER_MS, alternate: true },
        moving,
      )}
    >
      <Canvas px={px} box={CAVITY}>
        <Path
          d={SHIMMER}
          stroke={colour}
          strokeOpacity={0.5}
          strokeWidth={1.2}
          strokeLinecap="round"
          fill="none"
        />
      </Canvas>
    </Layer>
  );
}

function Fan({ colour, moving, px, ink }: Props & { readonly ink: VisualInk }): ReactNode {
  return (
    <>
      <Layer box={CAVITY} px={px} motion={loopStyle({ name: SPIN, ms: FAN_MS }, moving)}>
        <Canvas px={px} box={CAVITY}>
          <Path d={FAN_RING} stroke={ink.ink} strokeOpacity={0.6} strokeWidth={1} fill="none" />
          <Path d={FAN_BLADES} fill={colour} fillOpacity={0.85} />
        </Canvas>
      </Layer>
      <Shimmer colour={colour} moving={moving} px={px} />
    </>
  );
}

interface Props {
  readonly colour: string;
  readonly moving: boolean;
  readonly px: number;
}

export function ModeEffect({
  effect,
  warm,
  hot,
  fresh,
  ink,
  moving,
  px,
}: {
  readonly effect: MicrowaveEffect;
  readonly warm: string;
  readonly hot: string;
  readonly fresh: string;
  readonly ink: VisualInk;
  readonly moving: boolean;
  readonly px: number;
}): ReactNode {
  switch (effect) {
    case 'wave':
      return <Waves colour={warm} moving={moving} px={px} />;
    case 'grill':
      return <Grill colour={hot} moving={moving} px={px} />;
    case 'fan':
      return <Fan colour={warm} moving={moving} px={px} ink={ink} />;
    case 'fresh':
      return <Shimmer colour={fresh} moving={moving} px={px} />;
  }
}

export function CountdownRing({
  progress,
  colour,
  track,
  paused,
  size,
  px,
}: {
  readonly progress: number;
  readonly colour: string;
  readonly track: string;
  readonly paused: boolean;
  readonly size: 'card' | 'hero';
  readonly px: number;
}): ReactNode {
  const done = Math.max(0.01, progress) * RING_LENGTH;
  return (
    <Canvas px={px} layer>
      <Path
        d={RING}
        fill="none"
        stroke={track}
        strokeOpacity={0.4}
        strokeWidth={size === 'hero' ? 1.6 : 2}
      />
      <Path
        d={RING}
        fill="none"
        stroke={colour}
        strokeOpacity={paused ? 0.6 : 1}
        strokeWidth={size === 'hero' ? 1.8 : 2.4}
        strokeLinecap="round"
        strokeDasharray={`${done.toFixed(1)} ${RING_LENGTH.toFixed(1)}`}
      />
    </Canvas>
  );
}

export function FinishSteam({
  colour,
  px,
}: {
  readonly colour: string;
  readonly px: number;
}): ReactNode {
  return (
    <Layer
      box={STEAM_BOX}
      px={px}
      motion={loopStyle(
        { name: rise(Math.round(px * STEAM_RISE)), ms: STEAM_MS, easing: 'ease-out', times: 2 },
        true,
      )}
    >
      <Canvas px={px} box={STEAM_BOX}>
        <Path d={STEAM} fill={colour} fillOpacity={0.5} />
      </Canvas>
    </Layer>
  );
}

export function FinishGlow({
  colour,
  px,
}: {
  readonly colour: string;
  readonly px: number;
}): ReactNode {
  return (
    <Layer
      box={CAVITY}
      px={px}
      motion={loopStyle({ name: FINISH_FLASH, ms: FLASH_MS, easing: 'ease-out', times: 1 }, true)}
    >
      <Canvas px={px} box={CAVITY}>
        <Path d={WELL} fill={colour} />
      </Canvas>
    </Layer>
  );
}
