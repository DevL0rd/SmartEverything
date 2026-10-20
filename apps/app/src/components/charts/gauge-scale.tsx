import type { ReactNode } from 'react';
import { Line } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { polar } from './geometry';
import { clamp } from './scale';

export const GAUGE_START = -135;
export const GAUGE_SWEEP = 270;

const TICK_GAP = 3;
const MINOR_LENGTH = 3;
const MAJOR_LENGTH = 6;
const MARKER_OVERHANG = 3;

export interface GaugeTicks {
  readonly step: number;
  readonly majorEvery: number;
}

interface Frame {
  readonly size: number;
  readonly thickness: number;
  readonly min: number;
  readonly max: number;
}

function angleOf(frame: Frame, value: number): number {
  const span = frame.max - frame.min;
  const share = span === 0 ? 0 : (clamp(value, frame) - frame.min) / span;
  return GAUGE_START + share * GAUGE_SWEEP;
}

export function GaugeTickMarks({
  frame,
  ticks,
}: {
  readonly frame: Frame;
  readonly ticks: GaugeTicks;
}): ReactNode {
  const stroke = useColour('on-surface-variant');
  const centre = frame.size / 2;
  const inner = (frame.size - frame.thickness) / 2 - frame.thickness / 2 - TICK_GAP;
  const count = Math.floor((frame.max - frame.min) / ticks.step + 1e-9);
  return (
    <>
      {Array.from({ length: count + 1 }, (_, index) => {
        const major = index % ticks.majorEvery === 0;
        const angle = angleOf(frame, frame.min + index * ticks.step);
        const from = polar(centre, inner, angle);
        const to = polar(centre, inner - (major ? MAJOR_LENGTH : MINOR_LENGTH), angle);
        return (
          <Line
            key={index}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={stroke}
            strokeWidth={major ? 2 : 1}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

export function GaugeMarker({
  frame,
  value,
}: {
  readonly frame: Frame;
  readonly value: number;
}): ReactNode {
  const stroke = useColour('critical');
  const centre = frame.size / 2;
  const middle = (frame.size - frame.thickness) / 2;
  const reach = frame.thickness / 2 + MARKER_OVERHANG;
  const angle = angleOf(frame, value);
  const from = polar(centre, middle - reach, angle);
  const to = polar(centre, middle + reach, angle);
  return (
    <Line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={stroke}
      strokeWidth={3}
      strokeLinecap="round"
    />
  );
}
