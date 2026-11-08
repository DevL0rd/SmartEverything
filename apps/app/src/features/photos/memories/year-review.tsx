import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Bars } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { monthName } from './text';
import {
  memoryTitle,
  peakMonth,
  yearBars,
  yearBarsLabel,
  yearHighlights,
  type YearMemory,
} from './model';

interface YearProps {
  readonly memory: YearMemory;
  readonly onPlay: () => void;
}

function Stat({ value, label }: { readonly value: string; readonly label: string }): ReactNode {
  return (
    <View>
      <Text variant="title-3" className="tabular-nums">
        {value}
      </Text>
      <Text variant="caption" tone="variant">
        {label}
      </Text>
    </View>
  );
}

function Stats({ memory }: { readonly memory: YearMemory }): ReactNode {
  const peak = peakMonth(memory.review);
  const active = memory.review.perMonth.filter((month) => month.count > 0).length;
  return (
    <View className="flex-row flex-wrap gap-x-5 gap-y-2">
      <Stat value={count(memory.count)} label="photos and videos" />
      <Stat
        value={count(active)}
        label={active === 1 ? 'month with photos' : 'months with photos'}
      />
      {peak === null ? null : <Stat value={monthName(peak.month)} label="busiest month" />}
    </View>
  );
}

function MonthBars({
  memory,
  height,
}: {
  readonly memory: YearMemory;
  readonly height: number;
}): ReactNode {
  const peak = peakMonth(memory.review);
  return (
    <Bars
      bars={yearBars(memory.review)}
      colour="viz-1"
      label={yearBarsLabel(memory.review)}
      height={height}
      {...(peak === null ? {} : { highlightKey: peak.month })}
      formatValue={count}
    />
  );
}

function Highlights({ memory }: { readonly memory: YearMemory }): ReactNode {
  const highlights = yearHighlights(memory.review);
  return highlights.length === 0 ? null : (
    <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
      {highlights.map((highlight) => (
        <View key={highlight.key} className="flex-row items-center gap-1">
          <Icon name={highlight.icon} size={16} tone="variant" />
          <Text variant="footnote" tone="variant" className="tabular-nums">
            {`${highlight.label} ${highlight.value}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PlayButton({ memory, onPlay }: YearProps): ReactNode {
  return (
    <Button
      label={`Play ${String(memory.review.year)}`}
      icon="play"
      variant="tonal"
      onPress={onPlay}
    />
  );
}

function Heading({ memory }: { readonly memory: YearMemory }): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Text variant="label">{memoryTitle(memory)}</Text>
      <Badge label="Year in review" tone="primary" />
    </View>
  );
}

function DesktopYear({ memory, onPlay }: YearProps): ReactNode {
  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Heading memory={memory} />
        <PlayButton memory={memory} onPlay={onPlay} />
      </View>
      <View className="flex-row items-start gap-6">
        <Stats memory={memory} />
        <View className="min-w-0 flex-1">
          <MonthBars memory={memory} height={60} />
        </View>
      </View>
      <Highlights memory={memory} />
    </Card>
  );
}

function PhoneYear({ memory, onPlay }: YearProps): ReactNode {
  return (
    <Card className="gap-3">
      <Heading memory={memory} />
      <Stats memory={memory} />
      <MonthBars memory={memory} height={48} />
      <Highlights memory={memory} />
      <PlayButton memory={memory} onPlay={onPlay} />
    </Card>
  );
}

export function YearReview({
  memory,
  compact,
  onPlay,
}: YearProps & { readonly compact: boolean }): ReactNode {
  return compact ? (
    <PhoneYear memory={memory} onPlay={onPlay} />
  ) : (
    <DesktopYear memory={memory} onPlay={onPlay} />
  );
}
