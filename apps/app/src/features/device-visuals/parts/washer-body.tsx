import type { ReactNode } from 'react';
import { Circle, Ellipse, Path, Text as SvgText } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { Shine } from './material';
import { useSvgId } from './frame';
import { BodyGradient, DISPLAY_INK, FIXED_INK, GlowGradient, type VisualInk } from './ink';
import { rounded } from './shapes';
import type { LaundryFacts, VisualSize } from '../types';

export const DRUM = { cx: 50, cy: 57 } as const;
const BODY_PATH = 'M24 92V94M76 92V94';
const DIAL = { x: 72, y: 14 } as const;
const DIAL_SWEEP = 270;
const CLOCK = 'M53 11.4a2.6 2.6 0 1 0 .01 0M53 12.6V14l1.2.8';
const PAUSE = 'M46 12.2v3.6M47.7 12.2v3.6';
const DROP =
  'M36.4 11.2C37.8 12.8 38.6 13.8 38.6 14.8A2.2 2.2 0 0 1 34.2 14.8C34.2 13.8 35 12.8 36.4 11.2Z';

function pad(minutes: number): string {
  return String(minutes).padStart(2, '0');
}

function readoutOf(facts: LaundryFacts): string | null {
  switch (facts.display) {
    case 'time':
      return facts.remaining === null
        ? null
        : `${String(Math.floor(facts.remaining / 60))}:${pad(facts.remaining % 60)}`;
    case 'done':
      return 'Done';
    case 'clean':
      return 'Clean';
    case 'error':
      return `E${String(facts.faultCode ?? 0)}`;
    case 'blank':
    case 'program':
    case 'clock':
      return null;
  }
}

function tickOf(dial: number | null): string {
  const angle = (((dial ?? 0) * DIAL_SWEEP - DIAL_SWEEP / 2) * Math.PI) / 180;
  const x = Math.round((DIAL.x + 4.2 * Math.sin(angle)) * 10) / 10;
  const y = Math.round((DIAL.y - 4.2 * Math.cos(angle)) * 10) / 10;
  return `M${String(DIAL.x)} ${String(DIAL.y)}L${String(x)} ${String(y)}`;
}

function Readout({
  facts,
  colour,
}: {
  readonly facts: LaundryFacts;
  readonly colour: string;
}): ReactNode {
  const text = readoutOf(facts);
  return (
    <>
      {facts.display === 'clock' ? (
        <Path d={CLOCK} fill="none" stroke={colour} strokeWidth={0.7} strokeLinecap="round" />
      ) : null}
      {facts.paused ? (
        <Path d={PAUSE} stroke={colour} strokeWidth={0.8} strokeLinecap="round" />
      ) : null}
      {text === null ? null : (
        <SvgText
          transform={`translate(${facts.paused ? '56.4' : '53'} 15.6)`}
          fontSize={text.length > 4 ? 3.8 : 4.6}
          fontFamily="Geist-SemiBold"
          textAnchor="middle"
          fill={colour}
        >
          {text}
        </SvgText>
      )}
    </>
  );
}

function Display({
  facts,
  tile,
  colour,
  frame,
}: {
  readonly facts: LaundryFacts;
  readonly tile: boolean;
  readonly colour: string;
  readonly frame: string;
}): ReactNode {
  return (
    <>
      <Path
        d={rounded({ x: 44, y: 10, w: 18, h: 8, r: 1.5 })}
        fill={FIXED_INK.lcd}
        stroke={frame}
        strokeWidth={0.7}
      />
      {tile ? null : <Readout facts={facts} colour={colour} />}
    </>
  );
}

function Panel({
  facts,
  ink,
  tile,
}: {
  readonly facts: LaundryFacts;
  readonly ink: VisualInk;
  readonly tile: boolean;
}): ReactNode {
  const caution = useColour('caution');
  return (
    <>
      <Path
        d={rounded({ x: 20, y: 10, w: 20, h: 8, r: 1.5 })}
        fill={ink.dark}
        stroke={ink.edge}
        strokeWidth={0.7}
      />
      <Circle cx={DIAL.x} cy={DIAL.y} r={5} fill={ink.light} stroke={ink.edge} strokeWidth={0.8} />
      <Path d={tickOf(facts.dial)} stroke={ink.ink} strokeWidth={1} strokeLinecap="round" />
      {tile ? null : <Path d="M23 14H37" stroke={ink.ink} strokeWidth={1} strokeLinecap="round" />}
      {tile || !facts.lowSupply ? null : <Path d={DROP} fill={caution} />}
      {tile || !facts.childLock ? null : (
        <Path
          d="M79.7 10.6V9.9a1.1 1.1 0 0 1 2.2 0V10.6M78.8 10.6h3.6v2.8h-3.6Z"
          fill={ink.ink}
          stroke={ink.ink}
          strokeWidth={0.6}
        />
      )}
      {tile || !facts.remoteOff ? null : (
        <Path
          d="M78.6 18.4a2.6 2.6 0 0 1 3.8 0M79.8 19.8a1 1 0 0 1 1.4 0M78.4 15.6L82.6 20"
          fill="none"
          stroke={ink.ink}
          strokeWidth={0.6}
          strokeLinecap="round"
        />
      )}
    </>
  );
}

function Fittings({ ink, open }: { readonly ink: VisualInk; readonly open: boolean }): ReactNode {
  return (
    <>
      <Circle {...DRUM} r={22.5} fill="none" stroke={ink.dark} strokeWidth={1.6} />
      {open ? null : <Path d={rounded({ x: 76, y: 50, w: 3, h: 14, r: 1.5 })} fill={ink.ink} />}
      <Path d="M21 44h2M21 70h2" stroke={ink.ink} strokeWidth={1.6} strokeLinecap="round" />
    </>
  );
}

function Tint({
  tint,
  warm,
  cool,
}: {
  readonly tint: NonNullable<LaundryFacts['tint']>;
  readonly warm: string;
  readonly cool: string;
}): ReactNode {
  const heat = useSvgId('heat');
  const radial = tint === 'warm';
  const wash = tint === 'cool' ? cool : warm;
  return (
    <>
      {radial ? <GlowGradient id={heat} colour={warm} strength={0.3} /> : null}
      <Circle
        {...DRUM}
        r={20.4}
        fill={radial ? `url(#${heat})` : wash}
        fillOpacity={radial ? 1 : tint === 'cool' ? 0.12 : 0.06}
      />
    </>
  );
}

function Plate({
  ink,
  tile,
  facts,
  warm,
  cool,
}: {
  readonly ink: VisualInk;
  readonly tile: boolean;
  readonly facts: LaundryFacts;
  readonly warm: string;
  readonly cool: string;
}): ReactNode {
  const plate = useSvgId('plate');
  return (
    <>
      {tile ? null : <GlowGradient id={plate} colour={ink.well} strength={0.85} />}
      <Circle {...DRUM} r={20.4} fill={tile ? ink.dark : `url(#${plate})`} />
      {facts.tint === null || tile ? null : <Tint tint={facts.tint} warm={warm} cool={cool} />}
      {tile ? (
        <Circle
          {...DRUM}
          r={20.8}
          fill="none"
          stroke={ink.sheen}
          strokeOpacity={0.12}
          strokeWidth={0.6}
        />
      ) : null}
      {facts.door === 'open' && facts.drumLight ? (
        <Circle {...DRUM} r={20.4} fill={FIXED_INK.lamp} fillOpacity={0.45} />
      ) : null}
    </>
  );
}

const BODY = rounded({ x: 16, y: 6, w: 68, h: 86, r: 6 });

function Gloss({ size }: { readonly size: VisualSize }): ReactNode {
  if (size === 'tile') {
    return null;
  }
  return size === 'hero' ? (
    <Shine d={BODY} />
  ) : (
    <Path
      d="M18.2 84V12Q18.2 8.4 22 8.4H78"
      fill="none"
      stroke="#FFFFFF"
      strokeOpacity={0.55}
      strokeWidth={0.8}
      strokeLinecap="round"
    />
  );
}

export function Cabinet({
  facts,
  ink,
  size,
  colour,
  warm,
  cool,
}: {
  readonly facts: LaundryFacts;
  readonly ink: VisualInk;
  readonly size: VisualSize;
  readonly colour: string;
  readonly warm: string;
  readonly cool: string;
}): ReactNode {
  const body = useSvgId('washer');
  const tile = size === 'tile';
  const lit = facts.glow !== 'rest';
  return (
    <>
      <BodyGradient id={body} ink={ink} />
      <Ellipse cx={50} cy={94} rx={34} ry={3} fill={ink.sheen} fillOpacity={0.12} />
      <Path d={BODY_PATH} stroke={ink.edge} strokeWidth={2} strokeLinecap="round" />
      <Path
        d={BODY}
        fill={`url(#${body})`}
        stroke={ink.sheen}
        strokeOpacity={0.28}
        strokeWidth={1}
      />
      <Gloss size={size} />
      <Path d="M16 22H84" stroke={ink.edge} strokeWidth={0.8} />
      <Panel facts={facts} ink={ink} tile={tile} />
      <Display
        facts={facts}
        tile={tile}
        colour={DISPLAY_INK[facts.glow]}
        frame={lit ? colour : ink.edge}
      />
      <Circle {...DRUM} r={27} fill={ink.light} stroke={ink.edge} strokeWidth={1} />
      {tile ? null : <Fittings ink={ink} open={facts.door === 'open'} />}
      <Plate ink={ink} tile={tile} facts={facts} warm={warm} cool={cool} />
    </>
  );
}
