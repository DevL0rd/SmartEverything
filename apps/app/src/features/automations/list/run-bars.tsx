import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import { peakOf, stackOf, type RunStats, type StackSegment } from './run-stats';

const HEIGHT = 24;

const FILL = {
  succeeded: 'bg-positive',
  failed: 'bg-critical',
  ignored: 'bg-outline-variant',
} as const;

function Segment({ segment }: { readonly segment: StackSegment }): ReactNode {
  const size = { height: segment.height };
  return <View style={size} className={cn('w-full', FILL[segment.outcome])} />;
}

export const RunBars = memo(function RunBars({ stats }: { readonly stats: RunStats }): ReactNode {
  const peak = peakOf(stats.days);
  if (peak === 0) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Last 7 days: ${String(stats.total)} runs, ${String(stats.failed)} failed`}
      className="h-6 w-14 flex-row items-end gap-0.5"
    >
      {stats.days.map((day) => (
        <View
          key={day.day}
          className="flex-1 flex-col-reverse justify-start overflow-hidden rounded-xs"
        >
          {stackOf(day, peak, HEIGHT).map((segment) => (
            <Segment key={segment.outcome} segment={segment} />
          ))}
        </View>
      ))}
    </View>
  );
});
