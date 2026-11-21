import type { ReactNode } from 'react';
import { Figure, type FigureSize } from '../../../components/figure';
import type { Tone } from '../../../components/tone';
import { useClockParts } from '../../../store/clock-format';

export function ClockFigure({
  time,
  size,
  tone,
}: {
  readonly time: string;
  readonly size: FigureSize;
  readonly tone?: Tone;
}): ReactNode {
  const parts = useClockParts(time);
  return (
    <Figure
      value={parts.value}
      size={size}
      {...(parts.period === null ? {} : { unit: parts.period })}
      {...(tone === undefined ? {} : { tone })}
    />
  );
}
