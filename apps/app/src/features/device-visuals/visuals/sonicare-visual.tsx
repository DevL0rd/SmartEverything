import type { ReactNode } from 'react';
import { Circle, Ellipse, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { BREATHE, GLOW, loopStyle, sway, type LoopStyle } from '../../../design/loops';
import { HALO_COLOUR, HEAD_COLOUR, SHIMMER_MS } from '../model/toothbrush-look';
import { Canvas, Layer } from '../parts/frame';
import { useInk } from '../parts/ink';
import { ContactShadow } from '../parts/material';
import { questionPath } from '../parts/shapes';
import {
  BRISTLE_FIELD,
  Bristles,
  ChargeCell,
  Chassis,
  Controls,
  FaultMark,
  Halo,
  WearRing,
} from '../parts/brush-handle';
import type { ToothbrushFacts, VisualProps } from '../types';

const SHIMMER_PX = 0.9;
const WAVE_MS = 700;
const GLOW_MS = 1700;
const LED_MS = 2200;
const LED_TIMES = 3;

interface Motion {
  readonly shimmer: LoopStyle | null;
  readonly waves: LoopStyle | null;
  readonly glow: LoopStyle | null;
  readonly halo: LoopStyle | null;
  readonly led: LoopStyle | null;
}

function motionOf(
  facts: ToothbrushFacts,
  view: Pick<VisualProps, 'px' | 'moving' | 'reduced'>,
): Motion {
  const live = view.moving && !view.reduced;
  const brushing = live && facts.activity === 'brushing';
  const intensity = SHIMMER_MS[facts.intensity ?? 'none'];
  return {
    shimmer: loopStyle(
      { name: sway((SHIMMER_PX * view.px) / 100), ms: intensity, alternate: true },
      brushing,
    ),
    waves: loopStyle({ name: BREATHE, ms: WAVE_MS, alternate: true }, brushing),
    glow: loopStyle(
      { name: GLOW, ms: GLOW_MS, alternate: true },
      live && facts.activity === 'charging',
    ),
    halo: loopStyle(
      { name: BREATHE, ms: WAVE_MS, alternate: true },
      brushing && facts.pressure === 'too_high',
    ),
    led: loopStyle(
      { name: BREATHE, ms: LED_MS, alternate: true, times: LED_TIMES * 2 },
      live && facts.activity === 'standby',
    ),
  };
}

function ChargeGlow({
  px,
  motion,
}: {
  readonly px: number;
  readonly motion: LoopStyle | null;
}): ReactNode {
  const colour = useColour('positive');
  const box = { x: 30, y: 84, w: 40, h: 12 };
  return (
    <Layer box={box} px={px} motion={motion}>
      <Canvas px={px} box={box}>
        <Ellipse cx={50} cy={90} rx={18} ry={4.5} fill={colour} fillOpacity={0.4} />
      </Canvas>
    </Layer>
  );
}

function Waves({
  px,
  motion,
}: {
  readonly px: number;
  readonly motion: LoopStyle | null;
}): ReactNode {
  const ink = useInk();
  const box = { x: 24, y: 2, w: 52, h: 30 };
  return (
    <Layer box={box} px={px} motion={motion}>
      <Canvas px={px} box={box}>
        <Path
          d="M33 8c-3 4-3 12 0 16M29 6c-5 6-5 16 0 22"
          stroke={ink.sheen}
          strokeOpacity={0.5}
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M67 8c3 4 3 12 0 16M71 6c5 6 5 16 0 22"
          stroke={ink.sheen}
          strokeOpacity={0.5}
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
      </Canvas>
    </Layer>
  );
}

function Led({
  facts,
  awake,
  px,
  motion,
}: {
  readonly facts: ToothbrushFacts;
  readonly awake: boolean;
  readonly px: number;
  readonly motion: LoopStyle | null;
}): ReactNode {
  const ink = useInk();
  const lamp = useColour(facts.fault ? 'warning' : 'positive');
  const box = { x: 46, y: 56, w: 8, h: 8 };
  return (
    <Layer box={box} px={px} motion={motion}>
      <Canvas px={px} box={box}>
        <Circle cx={50} cy={60} r={1.5} fill={awake ? lamp : ink.faint} />
      </Canvas>
    </Layer>
  );
}

function Head({
  facts,
  px,
  motion,
}: {
  readonly facts: ToothbrushFacts;
  readonly px: number;
  readonly motion: Motion;
}): ReactNode {
  const ink = useInk();
  if (facts.head === 'missing') {
    return null;
  }
  if (facts.head === 'unrecognised') {
    return (
      <Canvas px={px}>
        <Path
          d={questionPath(50, 16, 12)}
          stroke={ink.sheen}
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
        />
      </Canvas>
    );
  }
  return (
    <>
      <Layer box={BRISTLE_FIELD} px={px} motion={motion.shimmer}>
        <Canvas px={px} box={BRISTLE_FIELD}>
          <Bristles ink={ink} />
        </Canvas>
      </Layer>
      {motion.waves === null ? null : <Waves px={px} motion={motion.waves} />}
    </>
  );
}

function HandleLayer({
  facts,
  px,
}: {
  readonly facts: ToothbrushFacts;
  readonly px: number;
}): ReactNode {
  const ink = useInk();
  const fitted = facts.head === 'fitted';
  return (
    <Canvas px={px}>
      <Chassis
        ink={ink}
        headRole={HEAD_COLOUR[facts.headType ?? (fitted ? 'other' : 'none')]}
        hasHead={facts.head !== 'missing'}
      />
      {fitted && facts.wear !== null ? <WearRing wear={facts.wear} /> : null}
      <Controls />
      {facts.battery !== null && facts.activity === 'charging' ? (
        <ChargeCell level={facts.battery / 100} charging />
      ) : null}
      {facts.fault ? <FaultMark /> : null}
    </Canvas>
  );
}

const HALO_BOX = { x: 24, y: 0, w: 52, h: 40 } as const;

function HaloLayer({
  facts,
  px,
  motion,
}: {
  readonly facts: ToothbrushFacts;
  readonly px: number;
  readonly motion: LoopStyle | null;
}): ReactNode {
  const halo = facts.pressure === null ? null : HALO_COLOUR[facts.brand][facts.pressure];
  if (halo === null || facts.activity !== 'brushing') {
    return null;
  }
  return (
    <Layer box={HALO_BOX} px={px} motion={motion}>
      <Canvas px={px} box={HALO_BOX}>
        <Halo role={halo} />
      </Canvas>
    </Layer>
  );
}

export function SonicareVisual({ state, px, tone, moving, reduced }: VisualProps): ReactNode {
  const facts = state.toothbrush;
  if (facts === undefined) {
    return null;
  }
  const motion = motionOf(facts, { px, moving, reduced });
  const awake = tone !== 'offline' && facts.activity !== 'asleep' && facts.activity !== 'off';
  return (
    <>
      <Canvas px={px}>
        <ContactShadow cx={50} cy={95} rx={22} ry={3.4} />
      </Canvas>
      {motion.glow === null ? null : <ChargeGlow px={px} motion={motion.glow} />}
      <HandleLayer facts={facts} px={px} />
      <Led facts={facts} awake={awake} px={px} motion={motion.led} />
      <Head facts={facts} px={px} motion={motion} />
      <HaloLayer facts={facts} px={px} motion={motion.halo} />
    </>
  );
}
