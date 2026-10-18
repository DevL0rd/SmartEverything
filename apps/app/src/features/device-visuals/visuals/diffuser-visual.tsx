import type { ReactNode } from 'react';
import { useState } from 'react';
import { Circle, Ellipse, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { BREATHE, EASE_IN_OUT, loopStyle, rise } from '../../../design/loops';
import { type Box, Canvas, FULL, Layer, scaled, useSvgId } from '../parts/frame';
import { BodyGradient, GlowGradient, useInk, useTint, WELL, type VisualInk } from '../parts/ink';
import { ContactShadow, LIGHT, ShineGradients, ShinePath, useShineIds } from '../parts/material';
import { rounded } from '../parts/shapes';
import type { VisualProps, VisualSize, VisualState } from '../types';

const BODY = rounded({ x: 27, y: 28, w: 46, h: 59, r: 17 });
const LID = rounded({ x: 30, y: 25, w: 40, h: 12, r: 6 });
const BAND = rounded({ x: 29, y: 72, w: 42, h: 5, r: 2.5 });
const CELLS = 4;
const CELL = { x: 41.5, y: 79.5, w: 3.4, h: 4, gap: 1.1 } as const;
const LOW_BATTERY = 20;
const CELL_SHARE = 100 / CELLS;
const BAND_BASE = 0.45;
const BAND_RANGE = 0.5;
const BOLT = 'M51 77.6L47.4 82H49.6L48.6 85.6L52.6 81H50.2Z';
const PLUME: Box = { x: 30, y: 0, w: 40, h: 30 };
const PLUME_RISE = 12;
const PLUME_MS = 1600;
const WISP =
  'M45 19a5 2.4 0 1 0 10 0a5 2.4 0 1 0-10 0M42 14a4 2 0 1 0 8 0a4 2 0 1 0-8 0M50 9.5a3 1.6 0 1 0 6 0a3 1.6 0 1 0-6 0';
const WISP_OPACITY = 0.28;
const FAULT = { x: 76, y: 32, r: 8 } as const;
const FAULT_MARK = 'M76 28.4V33M76 35.6V35.7';
const BREATH = { name: BREATHE, ms: 3200, easing: EASE_IN_OUT, alternate: true } as const;

function AmbientGlow({
  px,
  colour,
  moving,
}: {
  readonly px: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  const glow = useSvgId('diffuser-glow');
  return (
    <Layer box={FULL} px={px} motion={loopStyle(BREATH, moving)}>
      <Canvas px={px}>
        <GlowGradient id={glow} colour={colour} strength={0.4} />
        <Ellipse cx={50} cy={74} rx={41} ry={23} fill={`url(#${glow})`} />
      </Canvas>
    </Layer>
  );
}

function ChargingBolt({ ink }: { readonly ink: VisualInk }): ReactNode {
  const colour = useColour('warning');
  return (
    <>
      <Path d={BOLT} fill="none" stroke={ink.dark} strokeWidth={2.4} strokeLinejoin="round" />
      <Path d={BOLT} fill={colour} stroke={colour} strokeWidth={0.4} strokeLinejoin="round" />
    </>
  );
}

function BatteryNotch({
  ink,
  level,
  charging,
}: {
  readonly ink: VisualInk;
  readonly level: number;
  readonly charging: boolean;
}): ReactNode {
  const colour = useColour(level < LOW_BATTERY ? 'warning' : 'positive');
  const filled = Math.ceil(level / CELL_SHARE);
  return (
    <>
      {Array.from({ length: CELLS }, (_, index) => (
        <Path
          key={String(index)}
          d={rounded({
            x: CELL.x + index * (CELL.w + CELL.gap),
            y: CELL.y,
            w: CELL.w,
            h: CELL.h,
            r: 0.8,
          })}
          fill={index < filled ? colour : ink.well}
          fillOpacity={index < filled ? 0.9 : 0.25}
        />
      ))}
      {charging ? <ChargingBolt ink={ink} /> : null}
    </>
  );
}

function Plume({
  px,
  colour,
  at,
  playing,
}: {
  readonly px: number;
  readonly colour: string;
  readonly at: string | null;
  readonly playing: boolean;
}): ReactNode {
  const [first] = useState(at);
  const mist = useSvgId('diffuser-mist');
  if (!playing || at === null || first === at) {
    return null;
  }
  return (
    <Layer
      key={at}
      box={PLUME}
      px={px}
      motion={loopStyle(
        { name: rise(scaled(PLUME_RISE, px)), ms: PLUME_MS, easing: 'ease-out', times: 1 },
        true,
      )}
    >
      <Canvas px={px} box={PLUME}>
        <GlowGradient id={mist} colour={colour} strength={0.55} />
        <Ellipse cx={50} cy={22} rx={8} ry={4.5} fill={`url(#${mist})`} />
        <Ellipse cx={45} cy={12} rx={10} ry={5.5} fill={`url(#${mist})`} />
        <Ellipse cx={55} cy={4} rx={12} ry={6.5} fill={`url(#${mist})`} />
      </Canvas>
    </Layer>
  );
}

function Wisp({ colour }: { readonly colour: string }): ReactNode {
  return <Path d={WISP} fill={colour} fillOpacity={WISP_OPACITY} />;
}

function FaultMark(): ReactNode {
  const colour = useColour('critical');
  return (
    <>
      <Circle cx={FAULT.x} cy={FAULT.y} r={FAULT.r} fill={colour} />
      <Path d={FAULT_MARK} stroke={LIGHT} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </>
  );
}

interface DispenserProps {
  readonly ink: VisualInk;
  readonly tint: string;
  readonly colour: string | null;
  readonly strength: number;
  readonly battery: number | null;
  readonly charging: boolean;
  readonly scenting: boolean;
  readonly fault: boolean;
}

function Dispenser({
  ink,
  tint,
  colour,
  strength,
  battery,
  charging,
  scenting,
  fault,
}: DispenserProps): ReactNode {
  const body = useSvgId('diffuser-body');
  const lid = useSvgId('diffuser-lid');
  const shine = useShineIds();
  const lidShine = { wash: useSvgId('wash'), rim: shine.rim };
  return (
    <>
      <BodyGradient id={body} ink={ink} />
      <BodyGradient id={lid} ink={ink} vertical />
      <ContactShadow cx={50} cy={89} rx={32} ry={5} />
      <Path d={BODY} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.6} />
      <ShineGradients ids={shine} />
      <ShinePath d={BODY} ids={shine} />
      <Path d={LID} fill={`url(#${lid})`} stroke={ink.edge} strokeWidth={0.6} />
      <ShineGradients ids={lidShine} vertical rim={false} />
      <ShinePath d={LID} ids={lidShine} />
      <Ellipse cx={50} cy={28} rx={6} ry={1.8} fill={ink.well} fillOpacity={WELL} />
      <Path d="M47 28 H53" stroke={ink.faint} strokeWidth={0.8} strokeLinecap="round" />
      <Path
        d={BAND}
        fill={colour ?? ink.dark}
        fillOpacity={colour === null ? 1 : BAND_BASE + BAND_RANGE * strength}
        stroke={ink.edge}
        strokeWidth={0.3}
      />
      <Circle cx={50} cy={57} r={2} fill={ink.well} fillOpacity={0.25} />
      <Circle cx={50} cy={57} r={0.8} fill={tint} />
      {battery === null ? null : <BatteryNotch ink={ink} level={battery} charging={charging} />}
      {scenting ? <Wisp colour={colour ?? ink.ink} /> : null}
      {fault ? <FaultMark /> : null}
    </>
  );
}

interface Look {
  readonly battery: number | null;
  readonly charging: boolean;
  readonly scenting: boolean;
  readonly fault: boolean;
}

function lookOf(state: VisualState, size: VisualSize): Look {
  const fault = state.diffuser?.fault === true;
  return {
    battery: size === 'tile' ? null : state.battery,
    charging: state.diffuser?.charging === true,
    scenting: state.online && state.power === 'on' && !fault,
    fault,
  };
}

export function DiffuserVisual({ state, size, px, tone, moving }: VisualProps): ReactNode {
  const ink = useInk();
  const tint = useTint('primary', tone);
  const colour = state.online && state.ambientLight === true ? state.colour : null;
  const spray = state.diffuser?.spray ?? null;
  const playing = moving && state.online;
  return (
    <>
      {colour === null ? null : <AmbientGlow px={px} colour={colour} moving={moving} />}
      <Canvas px={px} layer>
        <Dispenser
          ink={ink}
          tint={tint}
          colour={colour}
          strength={state.level}
          {...lookOf(state, size)}
        />
      </Canvas>
      <Plume px={px} colour={colour ?? ink.ink} at={spray} playing={playing} />
    </>
  );
}
