import type { ReactNode } from 'react';
import { useState } from 'react';
import { Circle, Ellipse, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { BREATHE, EASE_IN_OUT, EYE_BLINK, hop, loopStyle } from '../../../design/loops';
import { type Box, Canvas, FULL, Layer, scaled, useSvgId } from '../parts/frame';
import { BodyGradient, FIXED_INK, useInk, useTint, type VisualInk } from '../parts/ink';
import { ContactShadow, ShineGradients, ShinePath, useShineIds } from '../parts/material';
import { rounded } from '../parts/shapes';
import { robotFacts } from '../model/facts/robot';
import { shouldHop } from '../model/robot-hop';
import type { RobotMood, VisualProps } from '../types';

const HEAD = rounded({ x: 20, y: 18, w: 60, h: 62, r: 28 });
const SCREEN = rounded({ x: 27, y: 30, w: 46, h: 32, r: 14 });
const EARS = `${rounded({ x: 14, y: 45, w: 8, h: 18, r: 4 })} ${rounded({ x: 78, y: 45, w: 8, h: 18, r: 4 })}`;
const EYES: Box = { x: 30, y: 36, w: 40, h: 20 };
const EYE_LEFT = 41;
const EYE_RIGHT = 59;
const BLINK_MS = 8000;
const HOP_UNITS = 7;
const HOP_MS = 1200;
const BAR_MS = 700;
const TALK_MS = 520;
const BARS = [
  rounded({ x: 89, y: 40, w: 2.6, h: 14, r: 1.3 }),
  rounded({ x: 93, y: 37, w: 2.6, h: 20, r: 1.3 }),
  rounded({ x: 97, y: 40, w: 2.6, h: 14, r: 1.3 }),
].join(' ');
const DOCK_FILL = 0.85;
const EYE_HEIGHT: Readonly<Partial<Record<RobotMood, number>>> = { listening: 7, worried: 5 };
const EYE_HEIGHT_DEFAULT = 6.2;
const SMILE = 'M46 56Q50 59 54 56';
const FROWN = 'M45 59Q50 55.5 55 59';
const BROWS = 'M34 41L46 37M66 41L54 37';
const ZZZ_OPACITY = 0.8;

function Dock({
  ink,
  charging,
  base,
}: {
  readonly ink: VisualInk;
  readonly charging: string;
  readonly base: boolean;
}): ReactNode {
  if (!base) {
    return <ContactShadow cx={50} cy={91} rx={28} ry={4} />;
  }
  return (
    <>
      <Ellipse
        cx={50}
        cy={90}
        rx={34}
        ry={6.5}
        fill={ink.light}
        stroke={ink.edge}
        strokeWidth={0.8}
      />
      <Ellipse cx={50} cy={89.5} rx={22} ry={3.4} fill={ink.dark} fillOpacity={DOCK_FILL} />
      <Circle cx={74} cy={90} r={1.9} fill={charging} />
    </>
  );
}

function Sheen(): ReactNode {
  const shine = useShineIds();
  return (
    <>
      <ShineGradients ids={shine} />
      <ShinePath d={HEAD} ids={shine} />
    </>
  );
}

function Screen({
  detailed,
  mouth,
}: {
  readonly detailed: boolean;
  readonly mouth: 'smile' | 'frown' | null;
}): ReactNode {
  return (
    <>
      <Path d={SCREEN} fill={FIXED_INK.lcd} stroke="none" />
      {detailed ? (
        <Path
          d="M32 35Q40 31 50 31"
          stroke={FIXED_INK.white}
          strokeWidth={1.2}
          strokeOpacity={0.16}
          fill="none"
          strokeLinecap="round"
        />
      ) : null}
      {mouth === null ? null : (
        <Path
          d={mouth === 'smile' ? SMILE : FROWN}
          stroke={FIXED_INK.white}
          strokeWidth={1.6}
          strokeOpacity={0.7}
          fill="none"
          strokeLinecap="round"
        />
      )}
    </>
  );
}

function Head({
  ink,
  asleep,
  detailed,
  mouth,
}: {
  readonly ink: VisualInk;
  readonly asleep: boolean;
  readonly detailed: boolean;
  readonly mouth: 'smile' | 'frown' | null;
}): ReactNode {
  const body = useSvgId('robot-body');
  return (
    <>
      <BodyGradient id={body} ink={ink} />
      <Path d={EARS} fill={ink.light} stroke={ink.edge} strokeWidth={0.6} />
      <Path d="M50 19V10" stroke={ink.ink} strokeWidth={2} strokeLinecap="round" />
      <Path d={HEAD} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.8} />
      {detailed ? <Sheen /> : null}
      <Screen detailed={detailed} mouth={mouth} />
      <Ellipse
        cx={50}
        cy={71}
        rx={7}
        ry={2.6}
        fill={asleep ? ink.edge : ink.faint}
        fillOpacity={asleep ? 0.6 : 0.8}
      />
    </>
  );
}

function Antenna({ tint }: { readonly tint: string }): ReactNode {
  return <Circle cx={50} cy={8.5} r={3.2} fill={tint} />;
}

function OpenEyes({ mood }: { readonly mood: RobotMood }): ReactNode {
  const worried = mood === 'worried';
  const cy = mood === 'listening' ? 43 : 46;
  const ry = EYE_HEIGHT[mood] ?? EYE_HEIGHT_DEFAULT;
  return (
    <>
      <Ellipse cx={EYE_LEFT} cy={cy} rx={4.2} ry={ry} fill={FIXED_INK.white} />
      <Ellipse cx={EYE_RIGHT} cy={cy} rx={4.2} ry={ry} fill={FIXED_INK.white} />
      {worried ? (
        <Path
          d={BROWS}
          stroke={FIXED_INK.white}
          strokeWidth={1.8}
          strokeOpacity={0.8}
          fill="none"
          strokeLinecap="round"
        />
      ) : null}
    </>
  );
}

function ClosedEyes(): ReactNode {
  return (
    <>
      <Path
        d="M36 47Q41 51 46 47"
        stroke={FIXED_INK.white}
        strokeWidth={2.2}
        strokeOpacity={0.6}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M54 47Q59 51 64 47"
        stroke={FIXED_INK.white}
        strokeWidth={2.2}
        strokeOpacity={0.6}
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function Face({
  px,
  mood,
  blinking,
}: {
  readonly px: number;
  readonly mood: RobotMood;
  readonly blinking: boolean;
}): ReactNode {
  if (mood === 'asleep') {
    return (
      <Canvas px={px} layer>
        <ClosedEyes />
      </Canvas>
    );
  }
  const motion = loopStyle({ name: EYE_BLINK, ms: BLINK_MS, easing: EASE_IN_OUT }, blinking);
  return (
    <Layer box={EYES} px={px} motion={motion}>
      <Canvas px={px} box={EYES}>
        <OpenEyes mood={mood} />
      </Canvas>
    </Layer>
  );
}

function Mouth({ px, moving }: Pick<VisualProps, 'px' | 'moving'>): ReactNode {
  const box: Box = { x: 44, y: 54, w: 12, h: 6 };
  const motion = loopStyle(
    { name: BREATHE, ms: TALK_MS, easing: EASE_IN_OUT, alternate: true },
    moving,
  );
  return (
    <Layer box={box} px={px} motion={motion}>
      <Canvas px={px} box={box}>
        <Path d={rounded({ x: 44, y: 55, w: 12, h: 3, r: 1.5 })} fill={FIXED_INK.white} />
      </Canvas>
    </Layer>
  );
}

function SoundBars({
  px,
  colour,
  moving,
}: {
  readonly px: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  const box: Box = { x: 88, y: 36, w: 12, h: 24 };
  const motion = loopStyle(
    { name: BREATHE, ms: BAR_MS, easing: EASE_IN_OUT, alternate: true },
    moving,
  );
  return (
    <Layer box={box} px={px} motion={motion}>
      <Canvas px={px} box={box}>
        <Path d={BARS} fill={colour} />
      </Canvas>
    </Layer>
  );
}

function Sleeping({ ink, px }: { readonly ink: VisualInk; readonly px: number }): ReactNode {
  return (
    <Canvas px={px} layer>
      <Path
        d="M74 14h6l-6 7h6M84 5h4.5l-4.5 5.4h4.5"
        fill="none"
        stroke={ink.ink}
        strokeWidth={1.4}
        strokeOpacity={ZZZ_OPACITY}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Canvas>
  );
}

function Hop({
  px,
  at,
  playing,
  children,
}: {
  readonly px: number;
  readonly at: string | null;
  readonly playing: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const [seen, setSeen] = useState(at);
  if (!playing && seen !== at) {
    setSeen(at);
  }
  const motion = shouldHop({ seen, at, playing })
    ? loopStyle(
        { name: hop(scaled(HOP_UNITS, px)), ms: HOP_MS, easing: 'ease-out', times: 1 },
        true,
      )
    : null;
  return (
    <Layer key={at ?? 'none'} box={FULL} px={px} motion={motion}>
      {children}
    </Layer>
  );
}

function mouthOf(mood: RobotMood): 'smile' | 'frown' | null {
  if (mood === 'awake' || mood === 'listening') {
    return 'smile';
  }
  return mood === 'worried' ? 'frown' : null;
}

function antennaOf(mood: RobotMood, tint: string, warning: string, faint: string): string {
  if (mood === 'asleep') {
    return faint;
  }
  return mood === 'worried' ? warning : tint;
}

export function RobotVisual({ state, size, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useTint('primary', tone);
  const charging = useColour(tone === 'active' ? 'positive' : 'on-surface-faint');
  const warning = useColour('warning');
  const robot = robotFacts(state);
  const awake = robot.mood !== 'asleep';
  const playing = moving && state.online;
  return (
    <>
      <Canvas px={px} layer>
        <Dock ink={ink} charging={charging} base={robot.onBase === true} />
      </Canvas>
      <Hop px={px} at={robot.move} playing={playing}>
        <Canvas px={px}>
          <Head ink={ink} asleep={!awake} detailed={size !== 'tile'} mouth={mouthOf(robot.mood)} />
          <Antenna tint={antennaOf(robot.mood, tint, warning, ink.faint)} />
        </Canvas>
        <Face px={px} mood={robot.mood} blinking={playing} />
        {robot.mood === 'speaking' ? <Mouth px={px} moving={playing} /> : null}
      </Hop>
      {robot.mood === 'listening' ? <SoundBars px={px} colour={tint} moving={playing} /> : null}
      {awake ? null : <Sleeping ink={ink} px={px} />}
    </>
  );
}
