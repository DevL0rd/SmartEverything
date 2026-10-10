import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../design/cn';
import { clock } from '../../format/time';
import { Text } from '../text';
import { extentOf } from './scale';

type SleepStage = 'deep' | 'core' | 'rem' | 'awake';

interface StageSegment {
  readonly start: number;
  readonly end: number;
  readonly stage: SleepStage;
}

export interface StageTimelineProps {
  readonly segments: readonly StageSegment[];
  readonly label: string;
  readonly compact?: boolean;
}

const LANE: Readonly<Record<SleepStage, number>> = { awake: 0, rem: 1, core: 2, deep: 3 };

const LANES = 4;

const FILL: Readonly<Record<SleepStage, string>> = {
  awake: 'bg-sleep-awake',
  rem: 'bg-sleep-rem',
  core: 'bg-sleep-core',
  deep: 'bg-sleep-deep',
};

const MIN_SHARE = 0.002;

function isPercent(written: string): written is `${number}%` {
  return /^-?\d+(\.\d+)?(e-?\d+)?%$/.test(written);
}

export function percentOf(share: number): `${number}%` {
  const written = `${String(Math.round(share * 10000) / 100)}%`;
  if (!isPercent(written)) {
    throw new RangeError(`A share must be a finite number, received ${String(share)}.`);
  }
  return written;
}

interface Place {
  readonly left: `${number}%`;
  readonly width: `${number}%`;
  readonly top: `${number}%`;
  readonly height: `${number}%`;
}

function placeOf(segment: StageSegment, from: number, span: number): Place {
  const left = (segment.start - from) / span;
  const width = Math.max(MIN_SHARE, (segment.end - segment.start) / span);
  return {
    left: percentOf(left),
    width: percentOf(width),
    top: percentOf(LANE[segment.stage] / LANES),
    height: percentOf(1 / LANES),
  };
}

export function StageTimeline({ segments, label, compact = false }: StageTimelineProps): ReactNode {
  const bounds = extentOf(segments.flatMap((segment) => [segment.start, segment.end]));
  if (bounds === null) {
    return null;
  }
  const span = Math.max(1, bounds.max - bounds.min);
  return (
    <View className="gap-1">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        className={cn(
          'relative overflow-hidden rounded-sm bg-surface-2',
          compact ? 'h-14' : 'h-28',
        )}
      >
        {segments.map((segment) => (
          <View
            key={`${String(segment.start)}-${segment.stage}`}
            style={placeOf(segment, bounds.min, span)}
            className="absolute p-px"
          >
            <View className={cn('flex-1 rounded-xs', FILL[segment.stage])} />
          </View>
        ))}
      </View>
      <View className="flex-row justify-between">
        <Text variant="caption" tone="faint" className="tabular">
          {clock(new Date(bounds.min))}
        </Text>
        <Text variant="caption" tone="faint" className="tabular">
          {clock(new Date(bounds.max))}
        </Text>
      </View>
    </View>
  );
}
