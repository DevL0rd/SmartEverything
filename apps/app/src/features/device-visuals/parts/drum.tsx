import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Circle, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { SPIN, drift, loopStyle, sway } from '../../../design/loops';
import type { LaundryFacts, VisualSize } from '../types';
import { SPARK, clothLoop, drumLoop, turnPeriod } from './drum-motion';
import { type Box, Canvas, FULL, Layer, boxStyle, scaled } from './frame';
import { FIXED_INK } from './ink';
import { Dots, type Emitter } from './particles';
import { circlePath } from './shapes';

const GLASS: Box = { x: 29.6, y: 36.6, w: 40.8, h: 40.8 };

const CENTRE = { cx: 50, cy: 57 } as const;
const SHIRT = 'M38 68C36 62 44 58 50 62C56 59 62 63 60 69C58 74 42 75 38 68Z';
const TOWEL = 'M47 72C46 67 56 64 62 67C66 70 63 75 57 75C52 76 48 75 47 72Z';
const STAR = 'M0-4L1-1L4 0L1 1L0 4L-1 1L-4 0L-1-1Z';
const WAVE_UNITS = 55;
const WAVE_DEPTH = GLASS.h + 6;
const WAVE = `M0 2q2.5-2 5 0${'t5 0'.repeat(10)}V${String(WAVE_DEPTH)}H0Z`;
const SUDS: readonly (readonly [number, number, number])[] = [
  [40, 4, 3.2],
  [47, 6, 2.4],
  [55, 5, 3],
  [61, 7, 2],
  [52, 9, 2.6],
];
const DROPS: readonly (readonly [number, number, number])[] = [
  [40, 41, 1.4],
  [47, 46, 1.2],
  [54, 42, 1.6],
  [61, 47, 1.2],
];
const SPARKS: readonly (readonly [number, number, number])[] = [
  [30, 34, 0],
  [72, 40, 180],
  [64, 82, 360],
];

function pointAt(radius: number, degrees: number): string {
  const x = CENTRE.cx + radius * Math.cos((degrees * Math.PI) / 180);
  const y = CENTRE.cy + radius * Math.sin((degrees * Math.PI) / 180);
  return `${String(Math.round(x * 10) / 10)} ${String(Math.round(y * 10) / 10)}`;
}

const LIFTERS = [0, 120, 240]
  .map((angle) => `M${pointAt(16, angle)}L${pointAt(20, angle)}`)
  .join('');
const HOLES = Array.from({ length: 12 }, (_, index) => `M${pointAt(12.5, index * 30)}h0`).join('');

export function Glass({
  px,
  children,
}: {
  readonly px: number;
  readonly children: ReactNode;
}): ReactNode {
  const window: ViewStyle = {
    ...boxStyle(GLASS, px),
    overflow: 'hidden',
    borderRadius: scaled(GLASS.w / 2, px),
  };
  const frame: ViewStyle = {
    position: 'absolute',
    left: -scaled(GLASS.x, px),
    top: -scaled(GLASS.y, px),
    width: px,
    height: px,
  };
  return (
    <View pointerEvents="none" style={window}>
      <View pointerEvents="none" style={frame}>
        {children}
      </View>
    </View>
  );
}

export function Water({
  px,
  facts,
  tile,
  moving,
  reduced,
}: {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly tile: boolean;
  readonly moving: boolean;
  readonly reduced: boolean;
}): ReactNode {
  const colour = useColour(facts.rinse ? 'laundry-rinse' : 'laundry-cool');
  if (tile || (facts.water <= 0 && !facts.drain)) {
    return null;
  }
  const level = facts.drain ? WAVE_DEPTH : (1 - facts.water) * GLASS.h - 1;
  const frame: ViewStyle = {
    ...boxStyle({ ...GLASS, w: WAVE_UNITS, h: WAVE_DEPTH }, px),
    transform: [{ translateY: scaled(level, px) }],
    ...(reduced
      ? {}
      : {
          transitionProperty: 'transform',
          transitionDuration: 600,
          transitionTimingFunction: 'ease-out',
        }),
  };
  const sea = loopStyle(
    { name: sway(scaled(10, px)), ms: 3800 },
    moving && !facts.drain,
    facts.frozen,
  );
  return (
    <Animated.View pointerEvents="none" style={frame}>
      <Animated.View pointerEvents="none" style={sea}>
        <Canvas px={px} box={{ x: 0, y: 0, w: WAVE_UNITS, h: WAVE_DEPTH }}>
          <Path d={WAVE} fill={colour} fillOpacity={facts.rinse ? 0.5 : 0.6} />
        </Canvas>
      </Animated.View>
    </Animated.View>
  );
}

export function Drum({
  px,
  facts,
  tile,
  moving,
}: {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly tile: boolean;
  readonly moving: boolean;
}): ReactNode {
  const stroke = useColour('outline');
  const holes = useColour('on-surface-variant');
  const rim = useColour('viz-violet');
  const loop = drumLoop(facts.motion, facts.spin);
  const motion = loop === null ? null : loopStyle(loop, moving, facts.frozen);
  return (
    <Layer box={GLASS} px={px} motion={motion}>
      <Canvas px={px} box={GLASS}>
        {facts.blur ? (
          <Circle
            {...CENTRE}
            r={17}
            fill="none"
            stroke={rim}
            strokeOpacity={0.5}
            strokeWidth={4.4}
          />
        ) : null}
        <Path d={LIFTERS} stroke={stroke} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        {tile ? null : (
          <Path
            d={HOLES}
            stroke={holes}
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </Canvas>
    </Layer>
  );
}

function Blob({
  px,
  d,
  index,
  facts,
  moving,
  still,
}: {
  readonly px: number;
  readonly d: string;
  readonly index: number;
  readonly facts: LaundryFacts;
  readonly moving: boolean;
  readonly still: boolean;
}): ReactNode {
  const colour = useColour(index === 0 ? 'viz-violet' : 'viz-5');
  const loop = still ? null : clothLoop(facts.motion, px, index);
  const motion = loop === null ? null : loopStyle(loop, moving, facts.frozen);
  return (
    <Layer box={GLASS} px={px} motion={motion}>
      <Canvas px={px} box={GLASS}>
        <Path d={d} fill={colour} fillOpacity={0.85} />
      </Canvas>
    </Layer>
  );
}

export function Clothes({
  px,
  facts,
  tile,
  moving,
}: {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly tile: boolean;
  readonly moving: boolean;
}): ReactNode {
  if (facts.blur) {
    return null;
  }
  return (
    <>
      <Blob px={px} d={SHIRT} index={0} facts={facts} moving={moving} still={tile} />
      {tile ? null : (
        <Blob px={px} d={TOWEL} index={1} facts={facts} moving={moving} still={tile} />
      )}
    </>
  );
}

export function SpinBlur({
  px,
  facts,
  tile,
  moving,
}: {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly tile: boolean;
  readonly moving: boolean;
}): ReactNode {
  if (tile || !facts.blur) {
    return null;
  }
  const share = Math.min(1, (facts.spin ?? 700) / 1400);
  const length = 6 + share * 34;
  const opacity = moving ? 0.22 + share * 0.3 : 0.22;
  const motion = loopStyle({ name: SPIN, ms: Math.round(turnPeriod(facts.spin) * 0.8) }, moving);
  return (
    <Layer box={GLASS} px={px} motion={motion}>
      <Canvas px={px} box={GLASS}>
        <Circle
          {...CENTRE}
          r={18.6}
          fill="none"
          stroke={FIXED_INK.white}
          strokeOpacity={opacity}
          strokeWidth={2.4}
          strokeDasharray={`${String(Math.round(length * 10) / 10)} ${String(Math.round((58.4 - length) * 10) / 10)}`}
        />
        <Circle
          {...CENTRE}
          r={15.6}
          fill="none"
          stroke={FIXED_INK.white}
          strokeOpacity={opacity * 0.8}
          strokeWidth={1.6}
          strokeDasharray={`${String(Math.round(length * 8) / 10)} ${String(Math.round((49 - length * 0.8) * 10) / 10)}`}
        />
      </Canvas>
    </Layer>
  );
}

function surfaceOf(water: number): number {
  return 37 + (1 - water) * 40;
}

function bubbles(
  rows: readonly (readonly [number, number, number])[],
  top: number,
  count: number,
): string {
  return rows
    .slice(0, count)
    .map(([cx, dy, r]) => circlePath({ cx, cy: top + dy, r }))
    .join(' ');
}

function staticBubbles(facts: LaundryFacts, count: number): string {
  return facts.suds ? bubbles(SUDS, surfaceOf(facts.water), count) : bubbles(DROPS, 0, count);
}

function foamEmitter(facts: LaundryFacts, count: number): Emitter {
  return facts.suds
    ? {
        x: 50,
        y: surfaceOf(facts.water) + 6,
        spread: 22,
        travel: 9,
        size: 3,
        count,
        ms: facts.phase === 'soak' ? 4400 : 2600,
      }
    : { x: 50, y: 40, spread: 22, travel: -22, size: 2.4, count, ms: 1600 };
}

function FoamBubbles({
  px,
  facts,
  size,
  animated,
}: {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly size: VisualSize;
  readonly animated: boolean;
}): ReactNode {
  const outline = useColour(facts.suds ? 'outline' : 'laundry-rinse');
  const count = size === 'hero' ? 5 : 3;
  const fill = facts.suds ? FIXED_INK.foam : FIXED_INK.droplet;
  if (!animated) {
    return (
      <Canvas px={px} layer>
        <Path d={staticBubbles(facts, count)} fill={fill} stroke={outline} strokeWidth={0.4} />
      </Canvas>
    );
  }
  return <Dots emitter={foamEmitter(facts, count)} px={px} colour={fill} edge={outline} />;
}

export function Foam(props: {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly size: VisualSize;
  readonly animated: boolean;
}): ReactNode {
  const { facts, size } = props;
  return size === 'tile' || (!facts.suds && !facts.drops) ? null : <FoamBubbles {...props} />;
}

function SteamPuffs({ px }: { readonly px: number }): ReactNode {
  const edge = useColour('outline');
  const emitter: Emitter = { x: 50, y: 70, spread: 16, travel: 12, size: 6, count: 3, ms: 2600 };
  return <Dots emitter={emitter} px={px} colour={FIXED_INK.foam} edge={edge} />;
}

export function Steam({
  px,
  facts,
  tile,
  animated,
}: {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly tile: boolean;
  readonly animated: boolean;
}): ReactNode {
  return tile || !facts.puffs || !animated ? null : <SteamPuffs px={px} />;
}

const HEAT = 'M38 72q-2-4 0-8t0-8M50 74q-2-4 0-8t0-8M62 72q-2-4 0-8t0-8';

export function Heat({
  px,
  facts,
  tile,
  moving,
}: {
  readonly px: number;
  readonly facts: LaundryFacts;
  readonly tile: boolean;
  readonly moving: boolean;
}): ReactNode {
  const colour = useColour('laundry-warm');
  const motion = loopStyle(
    { name: drift(scaled(2, px)), ms: 2400, easing: 'ease-in-out', alternate: true },
    moving,
    facts.frozen,
  );
  if (tile || !facts.heat) {
    return null;
  }
  return (
    <Layer box={FULL} px={px} motion={motion}>
      <Canvas px={px}>
        <Path
          d={HEAT}
          fill="none"
          stroke={colour}
          strokeOpacity={0.75}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </Canvas>
    </Layer>
  );
}

export function Sparkle({ px }: { readonly px: number }): ReactNode {
  const colour = useColour('positive');
  return SPARKS.map(([x, y, delay]) => (
    <Layer
      key={delay}
      box={{ x: x - 5, y: y - 5, w: 10, h: 10 }}
      px={px}
      motion={loopStyle({ name: SPARK, ms: 900, easing: 'ease-out', delay, times: 3 }, true)}
    >
      <Canvas px={px} box={{ x: -5, y: -5, w: 10, h: 10 }}>
        <Path d={STAR} fill={colour} />
      </Canvas>
    </Layer>
  ));
}
