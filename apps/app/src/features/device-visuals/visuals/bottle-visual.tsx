import { use, type ReactNode } from 'react';
import { Circle, G, LinearGradient, Path, Stop, type GProps } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { BREATHE, loopStyle, type LoopStyle } from '../../../design/loops';
import type { ColourRole } from '../../../design/tokens';
import { BOTTLE_TILT_DEGREES } from '../model/bottle-look';
import { Canvas, FULL, Layer, useSvgId, type Box } from '../parts/frame';
import { FIXED_INK, useInk, type VisualInk, WELL } from '../parts/ink';
import {
  ContactFloor,
  LIGHTING,
  LightingContext,
  ShineGradients,
  ShinePath,
  useShineIds,
} from '../parts/material';
import { Dots } from '../parts/particles';
import { rounded } from '../parts/shapes';
import { Water } from '../parts/water';
import { Haze, type Blob } from '../parts/haze';
import type { BottleFacts, BottleLight, VisualProps } from '../types';

const BODY = rounded({ x: 37.6, y: 24.8, w: 24.8, h: 71.7, r: 8.3 });
const WINDOW: Box = { x: 41, y: 29.7, w: 17.9, h: 62.8 };
const WINDOW_RADIUS = 4.8;
const WINDOW_PATH = rounded({ ...WINDOW, r: WINDOW_RADIUS });
const NECK = rounded({ x: 41.8, y: 22.1, w: 16.4, h: 3.4, r: 1 });
const LOOP = rounded({ x: 46.2, y: 1.2, w: 7.6, h: 5.5, r: 2.8 });
const CAP = rounded({ x: 38.6, y: 4.8, w: 22.8, h: 17.9, r: 4.8 });
const RING = rounded({ x: 38.6, y: 18.6, w: 22.8, h: 2.8, r: 1.4 });
const FLOOR: Blob = { cx: 50, cy: 97, rx: 18, ry: 2.6 };
const GLOW: Blob = { cx: 50, cy: 52, rx: 40, ry: 50 };
const TICKS: readonly number[] = [0.2, 0.4, 0.6, 0.8];
const MAJOR_TICKS: ReadonlySet<number> = new Set([0.4, 0.8]);
const POD = rounded({ x: 48.6, y: 24.1, w: 2.8, h: 40.7, r: 1.4 });
const BOLT = 'M52 44 45 56h5l-2 9 7-12h-5z';
const CHECK = 'M45.5 55l3 3 6-7';
const LOCK = 'M45.5 54h9v7h-9zM47.5 54v-2.5a2.5 2.5 0 0 1 5 0V54';
const FAULT = 'M50 46 58 61H42zM50 51v5M50 58.5v.5';
const BATTERY = 'M44.5 50h11v12h-11zM47.5 47.5h5v2.5h-5z';
const BREATHE_MS = 2200;
const UV_MS = 1400;
const BUBBLE_MS = 3600;
const BUBBLE_FROM_FILL = 0.12;
const LIFTED_CAP: GProps = { rotation: -14, origin: '39.8, 21', y: -6 };
const SEATED_CAP: GProps = {};
const BUBBLES = {
  x: 50,
  y: 88,
  spread: 5,
  travel: 34,
  size: 2,
  count: 3,
  ms: BUBBLE_MS,
} as const;

const RING_ROLE: Readonly<Record<BottleLight, ColourRole>> = {
  off: 'on-surface-faint',
  uv: 'viz-violet',
  reminder: 'info',
  charging: 'positive',
  charged: 'positive',
  interlock: 'warning',
  fault: 'critical',
  locked: 'on-surface-variant',
  low_battery: 'warning',
};

const BREATHING: ReadonlySet<BottleLight> = new Set(['uv', 'reminder', 'charging', 'low_battery']);

const STEEL = {
  light: { edge: '#7D8896', mid: '#AAB4BF', shine: '#F4F6F8' },
  dark: { edge: '#4A5461', mid: '#8B97A5', shine: '#D4DBE3' },
} as const;

function Steel({ id }: { readonly id: string }): ReactNode {
  const steel = use(LightingContext) === LIGHTING.light ? STEEL.light : STEEL.dark;
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <Stop offset="0" stopColor={steel.edge} />
      <Stop offset="0.22" stopColor={steel.shine} />
      <Stop offset="0.55" stopColor={steel.mid} />
      <Stop offset="1" stopColor={steel.edge} />
    </LinearGradient>
  );
}

function Pod({ ink }: { readonly ink: VisualInk }): ReactNode {
  return (
    <Path
      d={POD}
      fill={FIXED_INK.white}
      fillOpacity={0.1}
      stroke={ink.sheen}
      strokeOpacity={0.45}
      strokeWidth={0.45}
      strokeDasharray="1 1"
    />
  );
}

function Vessel({ ink, lifted }: { readonly ink: VisualInk; readonly lifted: boolean }): ReactNode {
  const body = useSvgId('bottle');
  const shine = useShineIds();
  return (
    <>
      <Steel id={body} />
      <ShineGradients ids={shine} />
      <Path d={BODY} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.45} />
      <ShinePath d={BODY} ids={shine} />
      <Path d={WINDOW_PATH} fill={ink.well} fillOpacity={WELL} />
      <Path d={NECK} fill={ink.dark} stroke={ink.edge} strokeWidth={0.3} />
      <Cap ink={ink} lifted={lifted} body={body} />
    </>
  );
}

function Glass({
  ink,
  filter,
  detail,
}: {
  readonly ink: VisualInk;
  readonly filter: boolean;
  readonly detail: boolean;
}): ReactNode {
  return (
    <>
      {filter ? <Pod ink={ink} /> : null}
      {detail ? <Scale ink={ink} /> : null}
    </>
  );
}

function Scale({ ink }: { readonly ink: VisualInk }): ReactNode {
  return (
    <>
      <Path d={WINDOW_PATH} fill="none" stroke={ink.edge} strokeWidth={0.5} />
      {TICKS.map((share) => {
        const y = WINDOW.y + WINDOW.h * (1 - share);
        const major = MAJOR_TICKS.has(share);
        return (
          <Path
            key={share}
            d={`M${String(WINDOW.x + WINDOW.w - (major ? 3.4 : 2.4))} ${String(y)}H${String(WINDOW.x + WINDOW.w - 0.6)}`}
            stroke={FIXED_INK.white}
            strokeOpacity={0.6}
            strokeWidth={major ? 0.55 : 0.35}
          />
        );
      })}
    </>
  );
}

function Cap({
  ink,
  lifted,
  body,
}: {
  readonly ink: VisualInk;
  readonly lifted: boolean;
  readonly body: string;
}): ReactNode {
  return (
    <G {...(lifted ? LIFTED_CAP : SEATED_CAP)}>
      <Path d={LOOP} fill="none" stroke={ink.ink} strokeWidth={1.4} />
      <Path d={CAP} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.45} />
      <Path d={RING} fill={ink.well} fillOpacity={WELL} />
    </G>
  );
}

function Glow({ light, px }: { readonly light: BottleLight; readonly px: number }): ReactNode {
  const colour = useColour(light === 'off' || light === 'locked' ? 'humidity' : RING_ROLE[light]);
  return <Haze px={px} blob={GLOW} colour={colour} strength={0.28} />;
}

function RingLight({
  light,
  motion,
  px,
  lifted,
}: {
  readonly light: BottleLight;
  readonly motion: LoopStyle | null;
  readonly px: number;
  readonly lifted: boolean;
}): ReactNode {
  const colour = useColour(RING_ROLE[light]);
  if (light === 'off') {
    return null;
  }
  const content = (
    <Canvas px={px}>
      <G {...(lifted ? LIFTED_CAP : SEATED_CAP)}>
        <Path d={RING} fill={colour} />
      </G>
    </Canvas>
  );
  return (
    <Layer box={FULL} px={px} motion={motion}>
      {content}
    </Layer>
  );
}

const MARK_PATH: Readonly<Partial<Record<BottleLight, string>>> = {
  charging: BOLT,
  charged: BOLT,
  locked: LOCK,
  fault: FAULT,
  low_battery: BATTERY,
};

function Mark({
  light,
  battery,
}: {
  readonly light: BottleLight;
  readonly battery: number | null;
}): ReactNode {
  const colour = useColour(RING_ROLE[light]);
  const d = MARK_PATH[light];
  if (d === undefined || (light === 'low_battery' && battery === null)) {
    return null;
  }
  const filled = light === 'charged';
  return (
    <>
      <Path
        d={d}
        fill={filled ? colour : 'none'}
        stroke={colour}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {filled ? (
        <Path
          d={CHECK}
          fill="none"
          stroke={FIXED_INK.white}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </>
  );
}

function Uv({ px, motion }: { readonly px: number; readonly motion: LoopStyle | null }): ReactNode {
  const colour = useColour('viz-violet');
  return (
    <Layer
      box={WINDOW}
      px={px}
      motion={motion}
      look={{ overflow: 'hidden', borderRadius: (WINDOW_RADIUS * px) / 100 }}
    >
      <Canvas px={px} box={WINDOW}>
        <Path d={WINDOW_PATH} fill={colour} fillOpacity={0.5} />
        <Circle cx={50} cy={60} r={10} fill={colour} fillOpacity={0.25} />
      </Canvas>
    </Layer>
  );
}

function motionOf(
  facts: BottleFacts,
  view: { readonly moving: boolean; readonly reduced: boolean },
): { readonly ring: LoopStyle | null; readonly uv: LoopStyle | null } {
  const live = view.moving && !view.reduced;
  const alive = facts.light === 'charged' || facts.light === 'locked' ? false : live;
  return {
    ring: loopStyle(
      { name: BREATHE, ms: BREATHE_MS, alternate: true, easing: 'ease-in-out' },
      alive && BREATHING.has(facts.light),
    ),
    uv: loopStyle(
      { name: BREATHE, ms: UV_MS, alternate: true, easing: 'ease-in-out' },
      live && facts.light === 'uv',
    ),
  };
}

function Pose({
  tilt,
  px,
  children,
}: {
  readonly tilt: BottleFacts['tilt'];
  readonly px: number;
  readonly children: ReactNode;
}): ReactNode {
  const degrees = BOTTLE_TILT_DEGREES[tilt];
  return degrees === 0 ? (
    children
  ) : (
    <Layer box={FULL} px={px} look={{ transform: [{ rotate: `${String(degrees)}deg` }] }}>
      {children}
    </Layer>
  );
}

function Level({
  facts,
  px,
  running,
}: {
  readonly facts: BottleFacts;
  readonly px: number;
  readonly running: boolean;
}): ReactNode {
  const water = useColour('humidity');
  return facts.fill === null ? null : (
    <Water
      box={WINDOW}
      px={px}
      level={facts.fill}
      colour={water}
      radius={WINDOW_RADIUS}
      running={running}
    />
  );
}

function hasBubbles(
  facts: BottleFacts,
  view: Pick<VisualProps, 'size' | 'moving' | 'reduced'>,
): boolean {
  return (
    view.moving &&
    !view.reduced &&
    view.size !== 'tile' &&
    facts.fill !== null &&
    facts.fill > BUBBLE_FROM_FILL
  );
}

export function BottleVisual(props: VisualProps): ReactNode {
  const { state, px, tone, moving, reduced } = props;
  const ink = useInk();
  const facts = state.bottle;
  if (facts === undefined) {
    return null;
  }
  const lifted = facts.light === 'interlock';
  const motion = motionOf(facts, { moving, reduced });
  const running = moving && !reduced && tone !== 'offline';
  return (
    <>
      <ContactFloor px={px} blob={FLOOR} />
      {props.size === 'tile' ? null : <Glow light={facts.light} px={px} />}
      <Pose tilt={facts.tilt} px={px}>
        <Canvas px={px} layer>
          <Vessel ink={ink} lifted={lifted} />
        </Canvas>
        <Level facts={facts} px={px} running={running} />
        {props.size === 'tile' && !facts.filter ? null : (
          <Canvas px={px} layer>
            <Glass ink={ink} filter={facts.filter} detail={props.size !== 'tile'} />
          </Canvas>
        )}
        {facts.light === 'uv' ? <Uv px={px} motion={motion.uv} /> : null}
        {hasBubbles(facts, props) ? (
          <Dots emitter={BUBBLES} px={px} colour={FIXED_INK.foam} />
        ) : null}
        <RingLight light={facts.light} motion={motion.ring} px={px} lifted={lifted} />
        <Canvas px={px} layer>
          <Mark light={facts.light} battery={facts.battery} />
        </Canvas>
      </Pose>
    </>
  );
}
