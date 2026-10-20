import type { ReactNode } from 'react';
import { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { QUARTERS, batteryRole, faceStars, type IoDisplay, type IoPips } from '../model/io-look';
import { rounded } from './shapes';

const INK = '#E8EEF6';
const FONT = 'GeistMono-Medium';
const BAR_FILL = 8.2;
const FACE_CENTRE = { x: 20, y: 100 } as const;
const FACE_RADIUS = 4.6;
const BAR = rounded({ x: 0, y: 0, w: 9, h: 2.6, r: 1.2 });

function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function Readout({
  y,
  size,
  text,
  opacity = 1,
}: {
  readonly y: number;
  readonly size: number;
  readonly text: string;
  readonly opacity?: number;
}): ReactNode {
  return (
    <SvgText
      transform={`translate(20 ${n(y)})`}
      textAnchor="middle"
      fontFamily={FONT}
      fontSize={size}
      fill={INK}
      fillOpacity={opacity}
    >
      {text}
    </SvgText>
  );
}

function BatteryBar({ y, percent }: { readonly y: number; readonly percent: number }): ReactNode {
  const fill = useColour(batteryRole(percent));
  const width = Math.max(0.5, (percent / 100) * BAR_FILL);
  return (
    <G transform={`translate(15.5 ${n(y)})`}>
      <Path d={BAR} fill="none" stroke={INK} strokeOpacity={0.8} strokeWidth={0.4} />
      <Path d={rounded({ x: 0.4, y: 0.4, w: width, h: 1.8, r: 0.9 })} fill={fill} />
    </G>
  );
}

function Pips({ pips }: { readonly pips: IoPips }): ReactNode {
  const current = useColour('positive');
  return Array.from({ length: QUARTERS }, (_, index) => (
    <Circle
      key={index}
      cx={20 + (index - 1.5) * 3.1}
      cy={111}
      r={1.2}
      fill={index < pips.current ? INK : index === pips.current ? current : 'none'}
      stroke={INK}
      strokeWidth={0.3}
      strokeOpacity={index > pips.current ? 0.45 : 1}
    />
  ));
}

function star(x: number, y: number, size: number): string {
  const wing = size * 0.3;
  return [
    `M${n(x)} ${n(y - size)}`,
    `L${n(x + wing)} ${n(y - wing)}`,
    `L${n(x + size)} ${n(y)}`,
    `L${n(x + wing)} ${n(y + wing)}`,
    `L${n(x)} ${n(y + size)}`,
    `L${n(x - wing)} ${n(y + wing)}`,
    `L${n(x - size)} ${n(y)}`,
    `L${n(x - wing)} ${n(y - wing)}Z`,
  ].join('');
}

function mouth(level: number): string {
  const { x, y } = FACE_CENTRE;
  const r = FACE_RADIUS;
  if (level === 1) {
    return `M${n(x - r * 0.4)} ${n(y + r * 0.42)}H${n(x + r * 0.4)}`;
  }
  const dip = r * (0.2 + 0.04 * level);
  return `M${n(x - r * 0.5)} ${n(y + r * 0.28)}Q${n(x)} ${n(y + r * 0.28 + dip * 2)} ${n(x + r * 0.5)} ${n(y + r * 0.28)}`;
}

function Face({ level }: { readonly level: number }): ReactNode {
  const { x, y } = FACE_CENTRE;
  const r = FACE_RADIUS;
  const stars = Array.from({ length: faceStars(level) }, (_, index) =>
    star(x + r * (1.05 - index * 0.62), y - r * (1.08 - (index % 2) * 0.2), r * 0.24),
  );
  return (
    <>
      <Circle cx={x} cy={y} r={r} fill="none" stroke={INK} strokeWidth={0.55} />
      <Circle cx={x - r * 0.38} cy={y - r * 0.2} r={r * 0.1} fill={INK} />
      <Circle cx={x + r * 0.38} cy={y - r * 0.2} r={r * 0.1} fill={INK} />
      <Path d={mouth(level)} fill="none" stroke={INK} strokeWidth={0.55} strokeLinecap="round" />
      {stars.map((d) => (
        <Path key={d} d={d} fill={INK} />
      ))}
    </>
  );
}

type Of<K extends IoDisplay['kind']> = Extract<IoDisplay, { readonly kind: K }>;

function Maybe({ percent, y }: { readonly percent: number | null; readonly y: number }): ReactNode {
  return percent === null ? null : <BatteryBar y={y} percent={percent} />;
}

function TimerRest({ display }: { readonly display: Of<'timer'> }): ReactNode {
  return (
    <>
      {display.pips === null ? null : <Pips pips={display.pips} />}
      <Maybe percent={display.battery} y={114.5} />
    </>
  );
}

function SummaryRest({ display }: { readonly display: Of<'summary'> }): ReactNode {
  const faced = display.face > 0;
  return (
    <>
      {faced ? <Face level={display.face} /> : null}
      <Readout y={faced ? 113 : 103} size={4} text={display.text} opacity={0.8} />
    </>
  );
}

function ChargingRest({ display }: { readonly display: Of<'charging'> }): ReactNode {
  return display.percent === null ? null : (
    <>
      <BatteryBar y={97} percent={display.percent} />
      <Readout y={109} size={5} text={`${String(display.percent)}%`} />
    </>
  );
}

function StandbyRest({ display }: { readonly display: Of<'standby'> }): ReactNode {
  return (
    <>
      {display.initials === null ? null : <Readout y={102} size={6} text={display.initials} />}
      <Maybe percent={display.battery} y={108} />
    </>
  );
}

export function DisplayRest({ display }: { readonly display: IoDisplay }): ReactNode {
  switch (display.kind) {
    case 'none':
    case 'dark':
      return null;
    case 'timer':
      return <TimerRest display={display} />;
    case 'summary':
      return <SummaryRest display={display} />;
    case 'charging':
      return <ChargingRest display={display} />;
    case 'standby':
      return <StandbyRest display={display} />;
  }
}

export function TimerText({ display }: { readonly display: IoDisplay }): ReactNode {
  return display.kind === 'timer' ? <Readout y={101} size={5.2} text={display.text} /> : null;
}
