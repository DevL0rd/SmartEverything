import type { ReactNode } from 'react';
import { Circle, Path, Text as SvgText } from 'react-native-svg';
import type { MicrowaveDisplay, MicrowaveEffect } from '../model/microwave-display';
import type { VisualSize } from '../types';
import { useSvgId } from './frame';
import { BodyGradient, FIXED_INK, type VisualInk } from './ink';
import { ContactShadow, Shine } from './material';
import {
  BODY,
  DIAL,
  DOOR,
  HANDLE,
  PANEL,
  WELL,
  litStep,
  pointerPath,
  ticksPath,
  DIAL_STEPS,
} from './microwave-geometry';
import { rounded } from './shapes';

const GLYPHS: Readonly<Record<MicrowaveEffect, string>> = {
  wave: 'M79.4 31.6q1.5-3 3 0t3 0t3 0',
  grill:
    'M84 27.4C85.7 29 86.6 30.2 86.6 31.6A2.6 2.6 0 0 1 81.4 31.6C81.4 30.5 82 29.8 82.7 29.2C82.9 30.1 83.3 30.6 83.8 30.8C84.3 30 84.3 28.8 84 27.4Z',
  fan: 'M79.6 29.2H88.4M79.6 31.6H88.4M79.6 34H88.4',
  fresh: 'M84 34.4Q79.6 31.4 82 27.6Q86.6 28.2 84 34.4Z',
};

const PAUSE_BARS = `${rounded({ x: 77.6, y: 28.6, w: 1.2, h: 5, r: 0.3 })}${rounded({ x: 80, y: 28.6, w: 1.2, h: 5, r: 0.3 })}`;
const REFLECTION = 'M13 29H27L16 73H13ZM30 29H34L23 73H19Z';
const OPEN_DOOR = 'M9 27L2 31.5V70.5L9 75Z';
const OPEN_INSET = 'M3.8 33.6L7.6 31.4V70.6L3.8 68.4Z';
const BOWL = 'M28 59.5Q40 72 52 59.5Z';
const BOWL_RIM = 'M28 59.5a12 2.6 0 1 0 24 0a12 2.6 0 1 0 -24 0';
const LOCK_BODY = rounded({ x: 87, y: 40, w: 5, h: 3.4, r: 0.8 });
const LOCK_SHACKLE = 'M88.2 40V39.2a1.3 1.3 0 0 1 2.6 0V40';
const PAUSED_X = 88.4;
const READOUT_X = 84;
const READOUT_Y = 34.4;
const SMALL_TEXT = 4.6;
const BIG_TEXT = 6.2;

function readoutColour(display: MicrowaveDisplay, positive: string): string {
  return display.phase === 'finished' ? positive : FIXED_INK.lamp;
}

function Readout({
  display,
  positive,
}: {
  readonly display: MicrowaveDisplay;
  readonly positive: string;
}): ReactNode {
  const paused = display.phase === 'paused';
  const colour = readoutColour(display, positive);
  return (
    <>
      {paused ? <Path d={PAUSE_BARS} fill={colour} /> : null}
      <SvgText
        transform={`translate(${String(paused ? PAUSED_X : READOUT_X)} ${String(READOUT_Y)})`}
        fontSize={paused || (display.readout?.length ?? 0) > 4 ? SMALL_TEXT : BIG_TEXT}
        fontFamily="Geist-SemiBold"
        textAnchor={paused ? 'end' : 'middle'}
        fill={colour}
      >
        {display.readout}
      </SvgText>
    </>
  );
}

function Panel({
  display,
  size,
  positive,
}: {
  readonly display: MicrowaveDisplay;
  readonly size: VisualSize;
  readonly positive: string;
}): ReactNode {
  if (size === 'tile') {
    return null;
  }
  if (display.readout !== null) {
    return <Readout display={display} positive={positive} />;
  }
  return display.glyph === null ? null : (
    <Path
      d={GLYPHS[display.glyph]}
      fill="none"
      stroke={FIXED_INK.lamp}
      strokeOpacity={0.8}
      strokeWidth={0.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Dial({
  ink,
  glow,
  power,
}: {
  readonly ink: VisualInk;
  readonly glow: string;
  readonly power: number | null;
}): ReactNode {
  const lit = litStep(power);
  return (
    <>
      <Path
        d={ticksPath(0, DIAL_STEPS - 1)}
        stroke={ink.edge}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      {lit < 0 ? null : (
        <Path d={ticksPath(0, lit)} stroke={glow} strokeWidth={1.7} strokeLinecap="round" />
      )}
      <Circle {...DIAL} r={4.8} fill={ink.dark} stroke={ink.edge} strokeWidth={0.8} />
      {lit < 0 ? null : (
        <Path d={pointerPath(lit)} stroke={ink.ink} strokeWidth={1} strokeLinecap="round" />
      )}
    </>
  );
}

function Door({
  ink,
  open,
  size,
}: {
  readonly ink: VisualInk;
  readonly open: boolean;
  readonly size: VisualSize;
}): ReactNode {
  if (open) {
    return (
      <>
        <Path
          d={OPEN_DOOR}
          fill={ink.light}
          stroke={ink.edge}
          strokeWidth={0.6}
          strokeLinejoin="round"
        />
        <Path d={OPEN_INSET} fill={ink.well} fillOpacity={0.55} />
      </>
    );
  }
  return (
    <>
      <Path d={HANDLE} fill={ink.faint} />
      {size === 'tile' ? null : <Path d={REFLECTION} fill={ink.sheen} fillOpacity={0.08} />}
    </>
  );
}

interface BodyProps {
  readonly ink: VisualInk;
  readonly glow: string;
  readonly positive: string;
  readonly display: MicrowaveDisplay;
  readonly size: VisualSize;
  readonly lit: boolean;
  readonly warm: string;
}

function Cooking({
  ink,
  warm,
  lit,
  size,
}: Pick<BodyProps, 'ink' | 'warm' | 'lit' | 'size'>): ReactNode {
  return size === 'tile' ? null : (
    <>
      <Path
        d={BOWL}
        fill={lit ? warm : ink.light}
        fillOpacity={lit ? 0.4 : 0.9}
        stroke={lit ? warm : ink.edge}
        strokeOpacity={0.7}
        strokeWidth={0.6}
      />
      <Path
        d={BOWL_RIM}
        fill={lit ? ink.dark : ink.well}
        fillOpacity={0.9}
        stroke={lit ? warm : ink.edge}
        strokeOpacity={0.8}
        strokeWidth={0.6}
      />
    </>
  );
}

export function MicrowaveBody({
  ink,
  glow,
  positive,
  display,
  size,
  lit,
  warm,
}: BodyProps): ReactNode {
  const body = useSvgId('microwave-body');
  return (
    <>
      <BodyGradient id={body} ink={ink} />
      <ContactShadow cx={50} cy={80.5} rx={44} ry={4} />
      <Path d="M14 79.6V82M86 79.6V82" stroke={ink.edge} strokeWidth={2.4} strokeLinecap="round" />
      <Path
        d={BODY}
        fill={`url(#${body})`}
        stroke={ink.faint}
        strokeOpacity={0.6}
        strokeWidth={0.8}
      />
      {size === 'tile' ? null : <Shine d={BODY} gloss />}
      <Path d={DOOR} fill={ink.well} fillOpacity={0.9} stroke={ink.edge} strokeWidth={0.5} />
      <Path d={WELL} fill={ink.dark} fillOpacity={0.2} />
      <Cooking ink={ink} warm={warm} lit={lit} size={size} />
      <Door ink={ink} open={display.open} size={size} />
      <Path d={PANEL} fill={FIXED_INK.lcd} stroke={ink.edge} strokeWidth={0.6} />
      <Panel display={display} size={size} positive={positive} />
      <Dial ink={ink} glow={glow} power={display.power} />
      <Path d="M78 65.5H90M78 70H90" stroke={ink.faint} strokeWidth={1.4} strokeLinecap="round" />
      {size === 'hero' && display.locked ? (
        <>
          <Path d={LOCK_BODY} fill={ink.ink} />
          <Path d={LOCK_SHACKLE} fill="none" stroke={ink.ink} strokeWidth={0.7} />
        </>
      ) : null}
    </>
  );
}
