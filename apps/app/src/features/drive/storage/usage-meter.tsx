import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SegmentBar } from '../../../components/charts';
import { ChartLegend } from '../../../components/charts/chart-legend';
import type { ChartSeries } from '../../../components/charts/chart-model';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { USAGE_COLOUR, type UsageLine } from './usage-model';

export interface UsageMeterProps {
  readonly leading: ReactNode;
  readonly title: string;
  readonly line: UsageLine;
  readonly note?: string | undefined;
  readonly trailing?: ReactNode;
}

function Foot({ note }: Pick<UsageMeterProps, 'note'>): ReactNode {
  if (note === undefined) return null;
  return (
    <Text variant="caption" tone="variant">
      {note}
    </Text>
  );
}

const USAGE_SERIES: readonly ChartSeries[] = [
  { points: [], colour: USAGE_COLOUR.live, label: 'Files' },
  { points: [], colour: USAGE_COLOUR.versions, label: 'Earlier versions' },
  { points: [], colour: USAGE_COLOUR.trash, label: 'Trash' },
];

export function UsageLegend(): ReactNode {
  return <ChartLegend series={USAGE_SERIES} valueOf={() => null} />;
}

export function UsageMeter(props: UsageMeterProps): ReactNode {
  const { leading, title, line, note, trailing } = props;
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        {leading}
        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline gap-3">
            <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
              {title}
            </Text>
            <Text
              variant="footnote"
              tone={line.tone}
              numberOfLines={1}
              className="tabular shrink-0"
            >
              {line.used}
            </Text>
          </View>
          <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
            {line.counts}
          </Text>
        </View>
        {trailing}
      </View>
      <SegmentBar
        segments={line.segments}
        total={line.total}
        label={`${title} used`}
        format={bytes}
      />
      <Foot note={note} />
    </View>
  );
}
