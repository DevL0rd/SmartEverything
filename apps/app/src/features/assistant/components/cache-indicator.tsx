import type { ReactNode } from 'react';
import Svg, { Circle } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { cacheBand, type CacheBand } from '../model/chat-footer';

const STROKE = 2;
const SEGMENTS = 4;
const GAP_RATIO = 0.28;

const BAND_FILLED: Readonly<Record<CacheBand, number>> = {
  none: 0,
  low: 1,
  part: 2,
  most: 3,
  all: SEGMENTS,
};

const BAND_ROLE: Readonly<Record<CacheBand, ColourRole>> = {
  none: 'on-surface-variant',
  low: 'warning',
  part: 'primary',
  most: 'positive',
  all: 'positive',
};

function segmentStarts(circumference: number): readonly number[] {
  const step = circumference / SEGMENTS;
  return Array.from({ length: SEGMENTS }, (_unused, index) => step * index);
}

export function CacheIndicator({
  percent,
  size = 16,
}: {
  readonly percent: number;
  readonly size?: number;
}): ReactNode {
  const band = cacheBand(percent);
  const filled = BAND_FILLED[band];
  const tone = useColour(BAND_ROLE[band]);
  const track = useColour('outline');
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (circumference / SEGMENTS) * (1 - GAP_RATIO);
  const centre = size / 2;
  return (
    <Svg width={size} height={size} aria-hidden>
      {segmentStarts(circumference).map((start, index) => (
        <Circle
          key={start}
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={index < filled ? tone : track}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${String(arcLength)} ${String(circumference)}`}
          transform={`rotate(${String((start / circumference) * 360 - 90)} ${String(centre)} ${String(centre)})`}
        />
      ))}
    </Svg>
  );
}
