import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StateTimeline } from '../../../components/charts';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { clock, hoursMinutes } from '../../../format/time';
import { DOING_COLOURS, doingLabel, doingTotals } from '../model/doing';
import type { PhoneDoingSegment } from '../data/phone-history';
import { CONTEXT_TEXT } from '../phone-context-text';

const TRACK_HEIGHT = 28;

const SWATCH = {
  still: 'bg-on-surface-faint',
  walking: 'bg-viz-1',
  running: 'bg-viz-2',
  cycling: 'bg-viz-3',
  driving: 'bg-viz-4',
  navigating: 'bg-viz-5',
  parked: 'bg-viz-6',
} as const;

function Legend({ segments }: { readonly segments: readonly PhoneDoingSegment[] }): ReactNode {
  return (
    <View className="gap-0.5">
      {doingTotals(segments).map((total) => (
        <View key={total.state} className="min-h-8 flex-row items-center gap-2">
          <View aria-hidden className={cn('h-1 w-4 rounded-full', SWATCH[total.state])} />
          <Text variant="callout" className="min-w-0 flex-1">
            {CONTEXT_TEXT[total.state]}
          </Text>
          <Text variant="callout" tone="variant" className="tabular">
            {hoursMinutes(total.minutes)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function DoingTimeline({
  segments,
  from,
  to,
}: {
  readonly segments: readonly PhoneDoingSegment[] | undefined;
  readonly from: number;
  readonly to: number;
}): ReactNode {
  if (segments === undefined) return <Skeleton shape="block" className="h-16" />;
  if (segments.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        Nothing recorded yet today.
      </Text>
    );
  }
  return (
    <View className="gap-3">
      <StateTimeline
        segments={segments}
        colours={DOING_COLOURS}
        label={doingLabel(doingTotals(segments))}
        height={TRACK_HEIGHT}
        from={from}
        to={to}
        captions={[clock(from), clock(to)]}
      />
      <Legend segments={segments} />
    </View>
  );
}
