import type { ReactNode } from 'react';
import { Circle, Line, Path } from 'react-native-svg';
import { useColour } from '../../../../design/colour';
import { eased } from '../../../../design/loops';
import type { ColourRole } from '../../../../design/tokens';
import type { TreadmillFacts } from '../../types';
import { Metal, Part, Plane, type Local } from './frame';
import { BELT_Y, WALKER_X, type Point } from './geometry';
import type { TreadmillMotion } from './motion';
import type { Silver } from './palette';
import { Label, Slab } from './shapes';

const KNOB: Point = { x: 338, y: 112 };
const KNOB_BOX: Local = { x: -8, y: -8, w: 16, h: 16 };
const KNOB_DEGREES_PER_KMH = 18;
const KEY_ANCHOR: Point = { x: 356, y: 105 };
const WAIST_REACH = 160;
const WAIST_RISE = 158;
const RADIANS = Math.PI / 180;
const SLANT = 'rotate(7 280 108)';
const TRAY =
  'M252 110Q252 101 265 101L342 104Q364 106 364 116V119Q364 126 354 126L268 123Q252 122 252 113Z';

export function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`;
}

export function waistOf(tilt: number, lean: number): Point {
  const beta = (tilt + lean + tilt * 0.5) * RADIANS;
  return { x: WALKER_X + WAIST_REACH * Math.sin(beta), y: BELT_Y - WAIST_RISE * Math.cos(beta) };
}

function lightOf(belt: TreadmillFacts['belt']): { role: ColourRole; opacity: number } {
  const states: Partial<Record<TreadmillFacts['belt'], { role: ColourRole; opacity: number }>> = {
    fault: { role: 'warning', opacity: 1 },
    safety_stop: { role: 'critical', opacity: 1 },
    paused: { role: 'caution', opacity: 0.9 },
    standby: { role: 'primary', opacity: 0 },
  };
  return states[belt] ?? { role: 'primary', opacity: 0.45 };
}

function Cord({
  pulled,
  tilt,
  lean,
  walker,
}: {
  readonly pulled: boolean;
  readonly tilt: number;
  readonly lean: number;
  readonly walker: boolean;
}): ReactNode {
  const critical = useColour('critical');
  const cord = useColour('on-surface-variant');
  if (!walker && !pulled) {
    return null;
  }
  const waist = waistOf(tilt, lean);
  const start = `M${String(KEY_ANCHOR.x)} ${String(KEY_ANCHOR.y)}`;
  const line = `${start}Q${String((waist.x + KEY_ANCHOR.x) / 2)} ${String(Math.max(waist.y, 150) + 40)} ${String(waist.x)} ${String(waist.y)}`;
  return (
    <Path
      d={pulled ? `${start}q8 14 5 28` : line}
      stroke={pulled ? critical : cord}
      strokeWidth={1.1}
      strokeDasharray="2.4 2"
      fill="none"
      opacity={pulled ? 1 : 0.75}
    />
  );
}

function Display({ silver, id, facts }: Look & { readonly facts: TreadmillFacts }): ReactNode {
  const off = facts.belt === 'standby';
  const incline = off || facts.inclineLabel === null ? '' : facts.inclineLabel;
  const text = { fill: silver.lcd, fontFamily: 'monospace', before: SLANT } as const;
  return (
    <>
      <Slab
        x={256}
        y={103.5}
        w={52}
        h={12}
        r={3}
        fill={`url(#${id}c)`}
        stroke={silver.sv5}
        strokeWidth={0.8}
        transform={SLANT}
      />
      <Label x={259} y={112.6} fontSize={9} {...text} text={off ? '' : facts.speedKmh.toFixed(1)} />
      <Label x={284} y={112.2} fontSize={6.6} textAnchor="middle" {...text} text={incline} />
      <Label
        x={304}
        y={112.2}
        fontSize={5.6}
        textAnchor="end"
        {...text}
        text={off ? '' : clock(facts.timeS)}
      />
    </>
  );
}

interface Look {
  readonly silver: Silver;
  readonly id: string;
}

function Strip({
  belt,
  tint,
}: {
  readonly belt: TreadmillFacts['belt'];
  readonly tint: string;
}): ReactNode {
  const light = lightOf(belt);
  const role = useColour(light.role);
  const fill = belt === 'running' ? tint : role;
  const opacity = belt === 'running' ? 1 : light.opacity;
  return (
    <>
      <Slab x={262} y={123} w={90} h={3.8} r={1.9} fill={fill} opacity={opacity * 0.8} />
      <Slab x={262} y={123.6} w={90} h={2.2} r={1.1} fill={fill} opacity={opacity} />
    </>
  );
}

export interface ConsoleProps extends Look {
  readonly px: number;
  readonly facts: TreadmillFacts;
  readonly motion: TreadmillMotion;
  readonly reduced: boolean;
  readonly tint: string;
  readonly tilt: number;
  readonly walker: boolean;
}

export function Console(props: ConsoleProps): ReactNode {
  const { px, facts, silver, id, motion, reduced, tint, tilt, walker } = props;
  const critical = useColour('critical');
  const pulled = facts.belt === 'safety_stop';
  return (
    <>
      <Plane px={px} look={facts.belt === 'standby' ? { opacity: 0.78 } : {}}>
        <Metal silver={silver} id={id} />
        <Path d={TRAY} fill={`url(#${id}f)`} stroke={silver.sv5} strokeWidth={0.8} />
        <Path
          d="M258 103.6L340 106.4"
          stroke={silver.rim}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <Display silver={silver} id={id} facts={facts} />
        <Circle
          cx={KNOB.x}
          cy={KNOB.y}
          r={7.4}
          fill={`url(#${id}f)`}
          stroke={silver.sv5}
          strokeWidth={0.8}
        />
        <Circle cx={KNOB.x} cy={KNOB.y} r={4.6} fill={silver.sv5} />
        {[0, 1, 2, 3, 4].map((index) => (
          <Circle key={index} cx={312 + index * 5.6} cy={119.4} r={1.2} fill={silver.sv5} />
        ))}
        <Strip belt={facts.belt} tint={tint} />
        <Slab
          x={352}
          y={101}
          w={9}
          h={6.4}
          r={1.6}
          fill={critical}
          stroke={silver.rim}
          strokeWidth={0.6}
          transform={pulled ? 'translate(5 28) rotate(18 356 104)' : undefined}
        />
        <Cord pulled={pulled} tilt={tilt} lean={motion.gait.lean} walker={walker} />
      </Plane>
      <Knob px={px} speed={facts.speedKmh} silver={silver} reduced={reduced} />
      <Arrow px={px} facts={facts} silver={silver} motion={motion} />
    </>
  );
}

function Arrow({
  px,
  facts,
  silver,
  motion,
}: {
  readonly px: number;
  readonly facts: TreadmillFacts;
  readonly silver: Silver;
  readonly motion: TreadmillMotion;
}): ReactNode {
  if (facts.inclineMoving === null || facts.belt === 'standby') {
    return null;
  }
  const d = facts.inclineMoving === 'up' ? 'M-3 1.6l3-3.8 3 3.8z' : 'M-3 -1.6l3 3.8 3-3.8z';
  return (
    <Part
      px={px}
      at={{ x: 297.6, y: 110 }}
      box={{ x: -4, y: -5, w: 8, h: 10 }}
      motion={motion.pulse}
      shape={<Path d={d} fill={silver.lcd} />}
    />
  );
}

function Knob({
  px,
  speed,
  silver,
  reduced,
}: {
  readonly px: number;
  readonly speed: number;
  readonly silver: Silver;
  readonly reduced: boolean;
}): ReactNode {
  return (
    <Part
      px={px}
      at={KNOB}
      box={KNOB_BOX}
      angle={speed * KNOB_DEGREES_PER_KMH}
      look={eased('transform', reduced) ?? {}}
      shape={
        <Line
          x1={0}
          y1={0}
          x2={0}
          y2={-4}
          stroke={silver.sv1}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      }
    />
  );
}
