import type { ReactNode } from 'react';
import { clock } from '../../format/time';
import type { ColourRole } from '../../design/tokens';
import { StateTimeline } from './state-timeline';
import { windowOf } from './timeline-model';

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

export const SLEEP_LANES: readonly SleepStage[] = ['awake', 'rem', 'core', 'deep'];

const SLEEP_COLOURS: Readonly<Record<SleepStage, ColourRole>> = {
  awake: 'sleep-awake',
  rem: 'sleep-rem',
  core: 'sleep-core',
  deep: 'sleep-deep',
};

const SLEEP_TRACK_HEIGHT = { compact: 56, full: 112 } as const;

export function StageTimeline({ segments, label, compact = false }: StageTimelineProps): ReactNode {
  const timeline = segments.map(({ start, end, stage }) => ({ start, end, state: stage }));
  const window = windowOf(timeline, {});
  if (window === null) {
    return null;
  }
  return (
    <StateTimeline
      segments={timeline}
      colours={SLEEP_COLOURS}
      lanes={SLEEP_LANES}
      label={label}
      height={compact ? SLEEP_TRACK_HEIGHT.compact : SLEEP_TRACK_HEIGHT.full}
      captions={[clock(new Date(window.from)), clock(new Date(window.to))]}
      track="surface-2"
    />
  );
}
