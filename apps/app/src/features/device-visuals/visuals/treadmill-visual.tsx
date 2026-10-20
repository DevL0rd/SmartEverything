import type { ReactNode } from 'react';
import { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { glowRole } from './treadmill/geometry';
import { useSvgId } from '../parts/frame';
import type { TreadmillFacts, VisualProps } from '../types';
import { Belt } from './treadmill/belt';
import { Console } from './treadmill/console';
import { Slab } from './treadmill/shapes';
import { Notices } from './treadmill/notices';
import {
  Floor,
  FrontFrame,
  Metal,
  Part,
  Plane,
  RearFrame,
  Stage,
  Tilting,
} from './treadmill/frame';
import { FLOOR_Y, LIFT_X, PIVOT, rotateAbout, tiltDegrees } from './treadmill/geometry';
import { motionOf, useDeckTilt, useMachineStyle } from './treadmill/motion';
import { useSilver, type Silver } from './treadmill/palette';
import { Walker } from './treadmill/walker';

const WALKING: ReadonlySet<TreadmillFacts['belt']> = new Set([
  'running',
  'paused',
  'countdown',
  'safety_stop',
]);
const LIFT_VISIBLE_FROM = 0.3;

function Lift({
  px,
  silver,
  id,
  degrees,
}: {
  readonly px: number;
  readonly silver: Silver;
  readonly id: string;
  readonly degrees: number;
}): ReactNode {
  if (degrees <= LIFT_VISIBLE_FROM) {
    return null;
  }
  const top = rotateAbout({ x: LIFT_X, y: FLOOR_Y }, degrees);
  const height = FLOOR_Y - top.y;
  return (
    <Plane px={px}>
      <Metal silver={silver} id={id} />
      <Slab x={top.x - 15} y={FLOOR_Y - 4} w={30} h={4} r={2} fill={silver.sv5} />
      <Slab x={top.x - 8} y={top.y + 2} w={16} h={height - 3} r={3} fill={`url(#${id}q)`} />
      <Slab
        x={top.x - 5}
        y={top.y + 4 + height * 0.45}
        w={10}
        h={height * 0.5}
        r={2}
        fill={`url(#${id}f)`}
      />
    </Plane>
  );
}

function Glow({
  px,
  colour,
  motion,
}: {
  readonly px: number;
  readonly colour: string;
  readonly motion: ReturnType<typeof motionOf>['glow'];
}): ReactNode {
  const id = useSvgId('tmglow');
  return (
    <Part
      px={px}
      at={{ x: 204, y: FLOOR_Y - 4 }}
      box={{ x: -176, y: -24, w: 352, h: 48 }}
      motion={motion}
      shape={
        <>
          <Defs>
            <RadialGradient id={id}>
              <Stop offset="0" stopColor={colour} stopOpacity={0.6} />
              <Stop offset="1" stopColor={colour} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={0} cy={0} rx={176} ry={24} fill={`url(#${id})`} />
        </>
      }
    />
  );
}

interface MachineProps extends Pick<VisualProps, 'px' | 'tone' | 'moving' | 'reduced'> {
  readonly facts: TreadmillFacts;
}

function Machine({ facts, px, tone, moving, reduced }: MachineProps): ReactNode {
  const silver = useSilver();
  const id = useSvgId('tmf');
  const degrees = tiltDegrees(facts.inclineGrade);
  const live = moving && !reduced;
  const tilt = useDeckTilt(degrees, live);
  const machine = useMachineStyle(tilt);
  const motion = motionOf(facts, { moving, reduced, px });
  const zone = useColour(glowRole(facts.zone, facts.heartZone));
  const heart = useColour('heart');
  const walker = tone !== 'offline' && WALKING.has(facts.belt);
  const glowing = facts.belt === 'running' || facts.belt === 'paused';
  const grips = facts.heartZone === null ? silver.acc : heart;
  return (
    <Stage px={px}>
      <Floor px={px} />
      {glowing ? <Glow px={px} colour={zone} motion={motion.glow} /> : null}
      <Lift px={px} silver={silver} id={id} degrees={degrees} />
      <Tilting px={px} pivot={PIVOT} look={machine}>
        <Plane px={px}>
          <RearFrame silver={silver} id={id} />
        </Plane>
        <Belt px={px} silver={silver} motion={motion.belt} />
        {walker ? <Walker px={px} motion={motion} tilt={tilt} /> : null}
        <Plane px={px}>
          <FrontFrame silver={silver} id={id} grips={grips} />
        </Plane>
        <Console
          {...{ px, facts, silver, id, motion, reduced, walker, tint: zone, tilt: degrees }}
        />
      </Tilting>
      <Notices px={px} facts={facts} silver={silver} tilt={degrees} live={live} />
    </Stage>
  );
}

export function TreadmillVisual({ state, px, tone, moving, reduced }: VisualProps): ReactNode {
  const facts = state.treadmill;
  if (facts === undefined) {
    return null;
  }
  return <Machine facts={facts} px={px} tone={tone} moving={moving} reduced={reduced} />;
}
