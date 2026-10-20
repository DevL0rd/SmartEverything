import { css, type CSSKeyframesRule } from 'react-native-reanimated';
import { use, type ReactNode } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path } from 'react-native-svg';
import { useColour, useColourResolver } from '../../../design/colour';
import type { LoopStyle } from '../../../design/loops';
import {
  IO_HEIGHT,
  IO_WIDTH,
  driveKey,
  driveStops,
  PRESSURE_RING_ROLE,
  type Drive,
  type IoRing,
  type PressureLevel,
} from '../model/io-look';
import { Layer, useSvgId, type Box } from './frame';
import { LIGHTING, LightingContext } from './material';

export const BODY_PATH =
  'M5 82a10 10 0 0 1 10-10H25a10 10 0 0 1 10 10V226a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6Z';
export const HEAD_TURN = 'rotate(-8 20 12)';
export const HEAD_CENTRE = { x: 20, y: 12 } as const;
export const BUTTON_CENTRE = { x: 20, y: 136 } as const;
const SCALE = 100 / IO_HEIGHT;
const LEFT = 50 - (IO_WIDTH * SCALE) / 2;

export const BOXES = {
  body: { x: 0, y: 0, w: IO_WIDTH, h: IO_HEIGHT },
  head: { x: 8, y: 0, w: 24, h: 24 },
  ring: { x: 0, y: 66, w: 40, h: 16 },
  sweep: { x: 0, y: 68, w: 40, h: 12 },
  glass: { x: 13, y: 88, w: 14, h: 33 },
  timer: { x: 13, y: 95, w: 14, h: 10 },
  button: { x: 12, y: 128, w: 16, h: 16 },
  puck: { x: 0, y: 229, w: 40, h: 11 },
} as const satisfies Record<string, Box>;

export const BRISTLE = { dark: '#F1EAD9', light: '#CDBE96' } as const;
const SWEEP_PATH: readonly (readonly [number, number])[] = [
  [-13.5, 0],
  [-9.5, 1.56],
  [0, 2.2],
  [9.5, 1.56],
  [13.5, 0],
];

export function frameBox(box: Box): Box {
  return { x: LEFT + box.x * SCALE, y: box.y * SCALE, w: box.w * SCALE, h: box.h * SCALE };
}

export function useLightTheme(): boolean {
  return use(LightingContext) === LIGHTING.light;
}

export function Slab({
  box,
  px,
  motion,
  label,
  children,
}: {
  readonly box: Box;
  readonly px: number;
  readonly motion?: LoopStyle | null;
  readonly label?: string;
  readonly children: ReactNode;
}): ReactNode {
  const unit = px / IO_HEIGHT;
  return (
    <Layer box={frameBox(box)} px={px} motion={motion ?? null}>
      <Svg
        {...(label === undefined ? {} : { role: 'img' as const, 'aria-label': label })}
        width={box.w * unit}
        height={box.h * unit}
        viewBox={`${String(box.x)} ${String(box.y)} ${String(box.w)} ${String(box.h)}`}
      >
        {children}
      </Svg>
    </Layer>
  );
}

const drives = new Map<string, CSSKeyframesRule>();

export function driveFrames(drive: Drive): CSSKeyframesRule {
  const key = driveKey(drive);
  const known = drives.get(key);
  if (known !== undefined) {
    return known;
  }
  const made = css.keyframes(
    Object.fromEntries(
      driveStops(drive).map((stop) => [
        `${String(stop.at)}%`,
        { transform: [{ rotate: `${String(stop.degrees)}deg` }] },
      ]),
    ),
  );
  drives.set(key, made);
  return made;
}

const sweeps = new Map<number, CSSKeyframesRule>();

export function sweepFrames(px: number): CSSKeyframesRule {
  const unit = Math.round((px / IO_HEIGHT) * 100) / 100;
  const known = sweeps.get(unit);
  if (known !== undefined) {
    return known;
  }
  const at = (index: number): Record<string, unknown> => {
    const [x, y] = SWEEP_PATH[index] ?? [0, 0];
    return {
      opacity: index === SWEEP_PATH.length - 1 ? 0 : 1,
      transform: [{ translateX: x * unit }, { translateY: y * unit }],
    };
  };
  const made = css.keyframes({
    '0%': at(0),
    '25%': at(1),
    '50%': at(2),
    '75%': at(3),
    '100%': at(4),
  });
  sweeps.set(unit, made);
  return made;
}

export function Tufts({ light }: { readonly light: boolean }): ReactNode {
  const colour = useColourResolver();
  const bristle = light ? BRISTLE.light : BRISTLE.dark;
  return (
    <G transform={HEAD_TURN}>
      {TUFTS.map(([x, y]) => (
        <Circle
          key={`${String(x)}-${String(y)}`}
          cx={x}
          cy={y}
          r={0.9}
          fill={bristle}
          stroke={colour('on-surface-variant')}
          strokeOpacity={0.5}
          strokeWidth={0.15}
        />
      ))}
    </G>
  );
}

const TUFTS: readonly (readonly [number, number])[] = [
  ...Array.from({ length: 12 }, (_, index): readonly [number, number] => {
    const angle = (index / 12) * Math.PI * 2;
    return [round(20 + 4.4 * Math.cos(angle)), round(12 + 5.8 * Math.sin(angle))];
  }),
  ...Array.from({ length: 6 }, (_, index): readonly [number, number] => {
    const angle = (index / 6) * Math.PI * 2 + 0.4;
    return [round(20 + 2.3 * Math.cos(angle)), round(12 + 3.1 * Math.sin(angle))];
  }),
  [20, 12],
];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function ringPaint(ring: IoRing, level: (name: PressureLevel) => string): string | null {
  switch (ring.kind) {
    case 'configured':
      return ring.hex;
    case 'pressure':
      return level(ring.level);
    case 'unlit':
    case 'unread':
      return null;
  }
}

const RING_SHAPE = { cx: 20, cy: 74, rx: 13.5, ry: 2.2, fill: 'none' } as const;

function RingBand({
  ring,
  paint,
}: {
  readonly ring: IoRing;
  readonly paint: string | null;
}): ReactNode {
  const colour = useColourResolver();
  if (paint === null) {
    return ring.kind === 'unread' ? (
      <Ellipse
        {...RING_SHAPE}
        stroke={colour('on-surface-variant')}
        strokeOpacity={0.9}
        strokeWidth={1.4}
        strokeDasharray="2.4 1.8"
      />
    ) : (
      <Ellipse
        {...RING_SHAPE}
        stroke={colour('on-surface')}
        strokeOpacity={0.16}
        strokeWidth={1.4}
      />
    );
  }
  return (
    <>
      <Ellipse
        {...RING_SHAPE}
        stroke={colour('on-surface')}
        strokeOpacity={0.25}
        strokeWidth={2.4}
      />
      <Ellipse {...RING_SHAPE} stroke={paint} strokeOpacity={0.35} strokeWidth={3.5} />
      <Ellipse {...RING_SHAPE} stroke={paint} strokeWidth={1.4} />
    </>
  );
}

export function Ring({ ring }: { readonly ring: IoRing }): ReactNode {
  const colour = useColourResolver();
  const clip = useSvgId('handleClip');
  const paint = ringPaint(ring, (level) => colour(PRESSURE_RING_ROLE[level]));
  return (
    <>
      <Defs>
        <ClipPath id={clip}>
          <Path d={BODY_PATH} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clip})`}>
        <RingBand ring={ring} paint={paint} />
      </G>
    </>
  );
}

export function SweepSpark(): ReactNode {
  return <Circle cx={20} cy={74} r={1.6} fill="#FFFFFF" />;
}

export function RippleRing(): ReactNode {
  const stroke = useColour('on-surface');
  return (
    <Circle
      cx={BUTTON_CENTRE.x}
      cy={BUTTON_CENTRE.y}
      r={4}
      fill="none"
      stroke={stroke}
      strokeWidth={0.5}
    />
  );
}

export function ChargeRing(): ReactNode {
  const stroke = useColour('positive');
  return <Ellipse cx={20} cy={235} rx={19} ry={4} fill="none" stroke={stroke} strokeWidth={1.2} />;
}
