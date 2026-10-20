import type { ReactNode } from 'react';
import { Circle, G, Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import {
  barPixels,
  bandShares,
  napMarkOf,
  nightShares,
  rectPath,
  usualShares,
  type BarsFrame,
  type Slot,
  type WindowColumn,
} from './night-bars-model';

export interface Usual {
  readonly bed: number;
  readonly wake: number;
}

const BAND_MINUTES = 30;
const BAND_OPACITY = 0.05;
const HIGHLIGHT_OPACITY = 0.08;
const BAR_RADIUS = 8;
const NAP_RADIUS = 3;
const NAP_STROKE = 1.5;
const NAP_MIN_PX = 5;
const DOT_R = 5;
const DOT_DENSE_R = 3;

export function yOf(frame: BarsFrame, share: number): number {
  return frame.top + share * frame.plotHeight;
}

export function Bands({
  frame,
  usual,
}: {
  readonly frame: BarsFrame;
  readonly usual: Usual;
}): ReactNode {
  const fill = useColour('on-surface');
  return (
    <G>
      {[usual.bed, usual.wake].map((minute) => {
        const band = bandShares(minute, BAND_MINUTES);
        return (
          <Path
            key={minute}
            d={rectPath({
              x: frame.left,
              width: frame.right - frame.left,
              top: yOf(frame, band.from),
              bottom: yOf(frame, Math.max(band.to, band.from + 1 / frame.plotHeight)),
            })}
            fill={fill}
            fillOpacity={BAND_OPACITY}
          />
        );
      })}
    </G>
  );
}

export function Highlight({
  frame,
  slot,
  slotWidth,
}: {
  readonly frame: BarsFrame;
  readonly slot: Slot;
  readonly slotWidth: number;
}): ReactNode {
  const fill = useColour('on-surface');
  return (
    <Path
      d={rectPath({
        x: slot.centre - slotWidth / 2,
        width: slotWidth,
        top: frame.top,
        bottom: frame.top + frame.plotHeight,
      })}
      fill={fill}
      fillOpacity={HIGHLIGHT_OPACITY}
    />
  );
}

export function NightBar({
  frame,
  slot,
  column,
}: {
  readonly frame: BarsFrame;
  readonly slot: Slot;
  readonly column: WindowColumn;
}): ReactNode {
  const fill = useColour('sleep-asleep');
  if (column.night === null) {
    return null;
  }
  const shares = nightShares(column.night);
  const pixels = barPixels(shares.from, shares.to, frame.plotHeight);
  const radius = Math.min(BAR_RADIUS, slot.width / 2);
  return (
    <Path
      d={rectPath(
        {
          x: slot.centre - slot.width / 2,
          width: slot.width,
          top: frame.top + pixels.from,
          bottom: frame.top + pixels.to,
        },
        radius,
      )}
      fill={fill}
    />
  );
}

export function Placeholder({
  frame,
  slot,
  usual,
}: {
  readonly frame: BarsFrame;
  readonly slot: Slot;
  readonly usual: Usual;
}): ReactNode {
  const stroke = useColour('on-surface-faint');
  const shares = usualShares(usual.bed, usual.wake);
  const pixels = barPixels(shares.from, shares.to, frame.plotHeight);
  return (
    <Path
      d={rectPath(
        {
          x: slot.centre - slot.width / 2,
          width: slot.width,
          top: frame.top + pixels.from,
          bottom: frame.top + pixels.to,
        },
        Math.min(BAR_RADIUS, slot.width / 2),
      )}
      fill="none"
      stroke={stroke}
      strokeWidth={NAP_STROKE}
      strokeDasharray="4 4"
    />
  );
}

export function NapMark({
  frame,
  slot,
  column,
  dense,
}: {
  readonly frame: BarsFrame;
  readonly slot: Slot;
  readonly column: WindowColumn;
  readonly dense: boolean;
}): ReactNode {
  const fill = useColour('surface-1');
  const stroke = useColour('on-surface');
  if (column.nap === null) {
    return null;
  }
  const mark = napMarkOf(column.nap);
  if (mark.kind === 'dot') {
    const radius = dense ? DOT_DENSE_R : DOT_R;
    return (
      <Circle
        cx={slot.centre}
        cy={frame.top + frame.plotHeight - radius - NAP_STROKE - 1}
        r={radius}
        fill={fill}
        stroke={stroke}
        strokeWidth={NAP_STROKE}
      />
    );
  }
  const pixels = barPixels(mark.from, mark.to, frame.plotHeight);
  const width = slot.width * 0.55;
  return (
    <Path
      d={rectPath(
        {
          x: slot.centre - width / 2,
          width,
          top: frame.top + pixels.from,
          bottom: frame.top + pixels.from + Math.max(NAP_MIN_PX, pixels.to - pixels.from),
        },
        NAP_RADIUS,
      )}
      fill={fill}
      stroke={stroke}
      strokeWidth={NAP_STROKE}
    />
  );
}
