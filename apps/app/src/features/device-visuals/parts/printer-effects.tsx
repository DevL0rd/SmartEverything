import type { ReactNode } from 'react';
import { Circle, Line, Path } from 'react-native-svg';
import { BREATHE, RING, drift, loopStyle, sway } from '../../../design/loops';
import type { PrinterFacts } from '../types';
import { Canvas, Layer, type Box } from './frame';
import type { VisualInk } from './ink';
import { rounded } from './shapes';

const SLOT_WINDOW: Box = { x: 52, y: 140, w: 216, h: 64 };
const SHEET: Box = { x: 32, y: -66, w: 152, h: 66 };
const CARRIAGE_FROM = 160;
const CARRIAGE_TRAVEL = 108;
const LED = { x: 238, y: 112 };
const RIPPLE: Box = { x: 218, y: 92, w: 40, h: 40 };
const BODY: Box = { x: 22, y: 80, w: 276, h: 96 };
const FUSER: Box = { x: 60, y: 142, w: 200, h: 8 };
const JAM_PATH = 'M96 150l12-9l9 8l11-10l10 9l12-8l11 9l12-9l10 8l11-9l10 10l-8 12h-100z';

export interface EffectTints {
  readonly paper: string;
  readonly hot: string;
  readonly good: string;
  readonly warm: string;
}

interface EffectProps {
  readonly facts: PrinterFacts;
  readonly px: number;
  readonly running: boolean;
  readonly ink: VisualInk;
  readonly tints: EffectTints;
}

function Sheet({ facts, px, running, ink }: EffectProps): ReactNode {
  if (facts.phase !== 'printing' || facts.part === 'path') return null;
  const travel = (SHEET.h * px) / 100;
  const motion = loopStyle({ name: drift(-travel), ms: 2400, easing: 'ease-in-out' }, running);
  return (
    <Layer box={SLOT_WINDOW} px={px} look={{ overflow: 'hidden' }}>
      <Layer box={SHEET} px={px} motion={motion}>
        <Canvas px={px} box={{ x: 0, y: 0, w: SHEET.w, h: SHEET.h }}>
          <Path
            d={rounded({ x: 0, y: 0, w: 152, h: 66, r: 2 })}
            fill={ink.sheen}
            fillOpacity={0.95}
            stroke={ink.edge}
            strokeWidth={0.5}
          />
          <Path d={rounded({ x: 12, y: 34, w: 100, h: 5, r: 1 })} fill={ink.faint} />
          <Path d={rounded({ x: 12, y: 44, w: 64, h: 4, r: 1 })} fill={ink.faint} />
        </Canvas>
      </Layer>
    </Layer>
  );
}

function Carriage({ facts, px, running, ink }: EffectProps): ReactNode {
  if (facts.variant !== 'inkjet') return null;
  const travel = (CARRIAGE_TRAVEL * px) / 100;
  const sweeping = facts.phase === 'printing';
  const motion = loopStyle(
    { name: sway(travel), ms: 1800, easing: 'ease-in-out', alternate: true },
    running && sweeping,
  );
  const x = sweeping ? CARRIAGE_FROM : 52;
  const box: Box = { x, y: 104, w: 26, h: 18 };
  return (
    <Layer box={box} px={px} motion={motion}>
      <Canvas px={px} box={{ x, y: 104, w: 26, h: 18 }}>
        <Path
          d={rounded({ x: x, y: 104, w: 26, h: 18, r: 3 })}
          fill={ink.dark}
          stroke={ink.edge}
          strokeWidth={0.8}
        />
        {facts.inks.slice(0, 4).map((entry, index) => (
          <Path
            d={rounded({ x: x + 3 + index * 5.5, y: 107, w: 4, h: 8, r: 1 })}
            key={index}
            fill={entry.colour}
          />
        ))}
      </Canvas>
    </Layer>
  );
}

function Led({ facts, px, running, tints }: EffectProps): ReactNode {
  const live = facts.phase === 'printing' || facts.phase === 'idle';
  const motion = loopStyle(
    { name: BREATHE, ms: 2600, easing: 'ease-in-out', alternate: true },
    running && live,
  );
  const box: Box = { x: LED.x - 8, y: LED.y - 8, w: 16, h: 16 };
  return (
    <Layer box={box} px={px} motion={motion}>
      <Canvas px={px} box={box}>
        <Circle
          cx={LED.x}
          cy={LED.y}
          r={7}
          fill={facts.phase === 'printing' ? tints.paper : tints.good}
          fillOpacity={0.35}
        />
      </Canvas>
    </Layer>
  );
}

function Rim({ facts, px, running, tints }: EffectProps): ReactNode {
  if (facts.phase !== 'stopped') return null;
  const motion = loopStyle(
    { name: BREATHE, ms: 1400, easing: 'ease-in-out', alternate: true },
    running,
  );
  return (
    <Layer box={BODY} px={px} motion={motion}>
      <Canvas px={px} box={BODY}>
        <Path
          d={rounded({ x: 24, y: 82, w: 272, h: 92, r: 18 })}
          fill="none"
          stroke={tints.hot}
          strokeWidth={3}
        />
      </Canvas>
    </Layer>
  );
}

function Ripples({ facts, px, running, tints }: EffectProps): ReactNode {
  if (!facts.identify) return null;
  return [0, 500, 1000].map((delay) => (
    <Layer
      key={delay}
      box={RIPPLE}
      px={px}
      motion={loopStyle({ name: RING, ms: 1800, delay, easing: 'ease-out' }, running)}
    >
      <Canvas px={px} box={RIPPLE}>
        <Circle cx={LED.x} cy={LED.y} r={9} fill="none" stroke={tints.good} strokeWidth={2} />
      </Canvas>
    </Layer>
  ));
}

function Glow({ facts, px, running, tints }: EffectProps): ReactNode {
  if (facts.variant !== 'laser' || facts.phase !== 'printing') return null;
  const motion = loopStyle(
    { name: BREATHE, ms: 1100, easing: 'ease-in-out', alternate: true },
    running,
  );
  return (
    <Layer box={FUSER} px={px} motion={motion}>
      <Canvas px={px} box={FUSER}>
        <Path d={rounded({ x: 62, y: 144, w: 196, h: 3, r: 1.5 })} fill={tints.warm} />
      </Canvas>
    </Layer>
  );
}

export function Jam({ facts, tints, px, ink }: Omit<EffectProps, 'running'>): ReactNode {
  const jam = facts.part === 'path' || facts.part === 'input-path' || facts.part === 'output-path';
  if (!jam) return null;
  return (
    <Canvas px={px} box={{ x: 0, y: 0, w: 320, h: 204 }} layer>
      <Path d={JAM_PATH} fill={ink.sheen} fillOpacity={0.92} stroke={tints.hot} strokeWidth={1.4} />
      <Line
        x1={62}
        y1={144}
        x2={258}
        y2={144}
        stroke={tints.hot}
        strokeWidth={1}
        strokeDasharray="4 3"
      />
    </Canvas>
  );
}

export function Effects(props: EffectProps): ReactNode {
  return (
    <>
      <Sheet {...props} />
      <Carriage {...props} />
      <Glow {...props} />
      <Led {...props} />
      <Rim {...props} />
      <Ripples {...props} />
    </>
  );
}
