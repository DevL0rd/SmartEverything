import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StateTimeline } from '../../components/charts';
import { Swatch } from '../../components/charts/chart-legend';
import { Text } from '../../components/text';
import { plural } from '../../format/text';
import type { RobotDay } from './activity-timeline';

const COLOURS = { awake: 'outline', talk: 'viz-1' } as const;

const LABEL = 'AIBI awake and talking over the last 24 hours';

function talkedText(talks: number): string {
  return talks === 0 ? 'Not talked to today' : `Talked ${plural(talks, 'time')} today`;
}

export function ActivityStrip({
  day,
  height,
  captions = false,
}: {
  readonly day: RobotDay;
  readonly height: number;
  readonly captions?: boolean;
}): ReactNode {
  return (
    <View className="gap-1">
      <StateTimeline
        segments={day.segments}
        colours={COLOURS}
        label={LABEL}
        height={height}
        from={day.from}
        to={day.to}
        empty="No activity yet"
        {...(captions ? { captions: ['24 h ago', 'Now'] } : {})}
      />
      {day.segments.length === 0 ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {talkedText(day.talks)}
        </Text>
      )}
    </View>
  );
}

const LEGEND = [
  { label: 'Talking', colour: 'viz-1' },
  { label: 'Awake', colour: 'outline' },
  { label: 'Asleep', colour: null },
] as const;

export function ActivityLegend(): ReactNode {
  return (
    <View aria-hidden className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      {LEGEND.map((entry) => (
        <View key={entry.label} className="flex-row items-center gap-1.5">
          <Swatch colour={entry.colour} />
          <Text variant="footnote" tone="variant">
            {entry.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
