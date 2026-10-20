import type { ReactNode } from 'react';
import { type SharedValue } from 'react-native-reanimated';
import { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useColour } from '../../../../design/colour';
import { useSvgId } from '../../parts/frame';
import { BELT_Y, WALKER_X } from './geometry';
import { useWalkerStyle, type TreadmillMotion } from './motion';
import { Part, type Local } from './frame';
import { WALKER } from './palette';
import { Slab } from './shapes';

const ROOT: Local = { x: -95, y: -300, w: 190, h: 300 };
const FEET = { x: WALKER_X, y: BELT_Y } as const;
const HIP = { x: 0, y: -158 } as const;
const ORIGIN = { x: 0, y: 0 } as const;
const SHOULDER = { x: 3, y: -240 } as const;
const KNEE = { x: 0, y: 76 } as const;
const ELBOW = { x: 0, y: 49 } as const;
const THIGH: Local = { x: -16, y: -6, w: 32, h: 92 };
const SHIN: Local = { x: -14, y: -12, w: 40, h: 118 };
const UPPER: Local = { x: -12, y: -6, w: 24, h: 60 };
const FORE: Local = { x: -10, y: -8, w: 24, h: 66 };

function Shaded({
  d,
  fill,
  id,
}: {
  readonly d: string;
  readonly fill: string;
  readonly id: string;
}): ReactNode {
  return (
    <>
      <Path d={d} fill={fill} />
      <Path d={d} fill={`url(#${id})`} />
    </>
  );
}

function Shade({ id }: { readonly id: string }): ReactNode {
  return (
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
        <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
        <Stop offset="1" stopColor="#000000" stopOpacity={0.32} />
      </LinearGradient>
    </Defs>
  );
}

function ThighShape({
  id,
  skin,
  shorts,
}: {
  readonly id: string;
  readonly skin: string;
  readonly shorts: string;
}): ReactNode {
  return (
    <>
      <Shade id={id} />
      <Shaded d="M-12 -2Q-13 38 -9 77H9Q12 38 12 -2Z" fill={skin} id={id} />
      <Shaded d="M-13 -4H13L11 38Q0 41-10 38Z" fill={shorts} id={id} />
    </>
  );
}

function ShinShape({ id, skin }: { readonly id: string; readonly skin: string }): ReactNode {
  return (
    <>
      <Shade id={id} />
      <Circle r={9} fill={skin} />
      <Shaded d="M-8.5 0Q-9 36-6 66H6Q9 36 8.5 0Z" fill={skin} id={id} />
      <Shaded d="M-8 64H7L9 69Q22 70 24 77V80H-9Q-10 72-8 64Z" fill={WALKER.shoe} id={id} />
      <Slab x={-9} y={77} w={34} h={4.2} r={2} fill={WALKER.sole} />
    </>
  );
}

interface LegProps {
  readonly px: number;
  readonly far: boolean;
  readonly angle: number;
  readonly bend: number;
  readonly thigh: TreadmillMotion['thighFront'];
  readonly shin: TreadmillMotion['shinFront'];
}

function Leg({ px, far, angle, bend, thigh, shin }: LegProps): ReactNode {
  const id = useSvgId(far ? 'tmlb' : 'tmlf');
  const skin = far ? WALKER.skinDark : WALKER.skin;
  const shorts = far ? WALKER.shortsDark : WALKER.shorts;
  return (
    <Part
      px={px}
      at={HIP}
      box={THIGH}
      angle={angle}
      motion={thigh}
      shape={<ThighShape id={id} skin={skin} shorts={shorts} />}
    >
      <Part
        px={px}
        at={KNEE}
        box={SHIN}
        angle={bend}
        motion={shin}
        shape={<ShinShape id={`${id}s`} skin={skin} />}
      />
    </Part>
  );
}

function Arm({
  px,
  far,
  angle,
  elbow,
  motion,
  sleeve,
}: {
  readonly px: number;
  readonly far: boolean;
  readonly angle: number;
  readonly elbow: number;
  readonly motion: TreadmillMotion['armFront'];
  readonly sleeve: string;
}): ReactNode {
  const id = useSvgId(far ? 'tmab' : 'tmaf');
  const skin = far ? WALKER.skinDark : WALKER.skin;
  return (
    <Part
      px={px}
      at={SHOULDER}
      box={UPPER}
      angle={angle}
      motion={motion}
      shape={
        <>
          <Shade id={id} />
          <Shaded d="M-6.5 -2Q-8 24-6 50H6Q8 24 6.5-2Z" fill={skin} id={id} />
          <Shaded d="M-8 -4Q-9.5 10-8.5 24H8.5Q9.5 10 8-4Z" fill={sleeve} id={id} />
        </>
      }
    >
      <Part
        px={px}
        at={ELBOW}
        box={FORE}
        angle={-elbow}
        shape={
          <>
            <Shade id={`${id}f`} />
            <Circle r={6} fill={skin} />
            <Shaded d="M-5.4 0Q-6 22-4.2 40H4.2Q6 22 5.4 0Z" fill={skin} id={`${id}f`} />
            <Circle cx={0.5} cy={44} r={6} fill={skin} />
          </>
        }
      />
    </Part>
  );
}

function Torso({ px, shirt }: { readonly px: number; readonly shirt: string }): ReactNode {
  const id = useSvgId('tmtorso');
  return (
    <Part
      px={px}
      at={ORIGIN}
      box={ROOT}
      shape={
        <>
          <Shade id={id} />
          <Shaded
            d="M-15 -156Q-20 -200-13 -244Q0 -254 16 -244Q22 -200 16 -156Q0 -150-15 -156Z"
            fill={shirt}
            id={id}
          />
          <Shaded
            d="M-15 -168Q0 -162 16 -168L16 -156Q0 -150-15 -156Z"
            fill={WALKER.shorts}
            id={id}
          />
          <Path d="M-3 -252H9V-242H-3Z" fill={WALKER.skin} />
          <Circle cx={6} cy={-270} r={16} fill={WALKER.skin} />
          <Path
            d="M-10 -272Q-10 -290 6 -287Q22 -286 22 -272Q14 -282 -2 -278Q-8 -276-10 -272Z"
            fill={WALKER.hair}
          />
        </>
      }
    />
  );
}

export function Walker({
  px,
  motion,
  tilt,
}: {
  readonly px: number;
  readonly motion: TreadmillMotion;
  readonly tilt: SharedValue<number>;
}): ReactNode {
  const shirt = useColour('viz-6');
  const { gait } = motion;
  const lean = useWalkerStyle(tilt, gait.lean);
  const back = { far: true, angle: gait.amp * 0.55, bend: gait.bend * 0.3 } as const;
  const front = { far: false, angle: gait.amp * -0.5, bend: gait.bend * 0.04 } as const;
  return (
    <Part px={px} at={FEET} box={ROOT} look={lean}>
      <Part px={px} at={ORIGIN} box={ROOT} motion={motion.bob}>
        <Leg px={px} {...back} thigh={motion.thighBack} shin={motion.shinBack} />
        <Arm
          px={px}
          far
          angle={gait.arm * -0.6}
          elbow={gait.elbow}
          motion={motion.armBack}
          sleeve={shirt}
        />
        <Torso px={px} shirt={shirt} />
        <Leg px={px} {...front} thigh={motion.thighFront} shin={motion.shinFront} />
        <Arm
          px={px}
          far={false}
          angle={gait.arm * 0.6}
          elbow={gait.elbow}
          motion={motion.armFront}
          sleeve={shirt}
        />
      </Part>
    </Part>
  );
}
