import type { PhotoInsightRange, PhotoInsights } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { CalendarHeatmap, Donut, FillChart, HourHeatmap } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { bytes } from '../../../format/number';
import {
  SEASON_ROWS,
  WEEK_ROWS,
  busiestLine,
  calendarFrom,
  heatDays,
  seasonLine,
  seasonMatrix,
  weekLine,
  weekMatrix,
} from './heat-model';
import { growthSeries, growthTicks, kindSlices, photoShare, type GrowthSeries } from './model';
import { useClockFormat } from '../../../store/clock-format';

function Caption({ text }: { readonly text: string | null }): ReactNode {
  return text === null ? null : (
    <Text variant="caption" tone="variant">
      {text}
    </Text>
  );
}

export function LegendDot({ colour }: { readonly colour: ColourRole }): ReactNode {
  const fill = { backgroundColor: useColour(colour) };
  return <View aria-hidden className="size-2 rounded-full" style={fill} />;
}

function GrowthRow({ series }: { readonly series: GrowthSeries }): ReactNode {
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-1.5">
        <LegendDot colour={series.colour} />
        <Text variant="caption" tone="variant" className="flex-1">
          {series.label}
        </Text>
        <Text variant="caption" className="tabular">
          {bytes(series.latest)}
        </Text>
      </View>
      <View className="h-16">
        <FillChart
          values={series.values}
          kind="line"
          colour={series.colour}
          label={`${series.label} in the library by month, now ${bytes(series.latest)}`}
        />
      </View>
    </View>
  );
}

export function GrowthCard({
  growth,
  className,
}: {
  readonly growth: NonNullable<PhotoInsights['growth']>;
  readonly className: string;
}): ReactNode {
  const ticks = growthTicks(growth);
  return (
    <Card title="Library growth by kind" className={className}>
      {growthSeries(growth).map((series) => (
        <GrowthRow key={series.group} series={series} />
      ))}
      <View aria-hidden className="flex-row justify-between">
        {ticks.map((tick) => (
          <Text key={tick} variant="caption" tone="faint" className="tabular">
            {tick}
          </Text>
        ))}
      </View>
    </Card>
  );
}

export function KindsCard({
  insights,
  className,
}: {
  readonly insights: PhotoInsights;
  readonly className: string;
}): ReactNode {
  return (
    <Card title="Kinds" className={className}>
      <View className="flex-1 items-center justify-center">
        <Donut slices={kindSlices(insights)} size={112} label="Kinds by number of items">
          <Text variant="title-3" className="tabular">
            {photoShare(insights)}
          </Text>
        </Donut>
      </View>
    </Card>
  );
}

export function CalendarCard({
  insights,
  range,
  today,
  compact,
}: {
  readonly insights: PhotoInsights;
  readonly range: PhotoInsightRange;
  readonly today: string;
  readonly compact: boolean;
}): ReactNode {
  const busiest = <Caption text={busiestLine(insights.busiestDays)} />;
  return (
    <Card title="Photos per day" {...(compact ? {} : { metadata: busiest })}>
      {compact ? busiest : null}
      <CalendarHeatmap
        days={heatDays(insights.perDay, calendarFrom(range, today), today)}
        today={today}
        split={compact ? 2 : 1}
        unit="photos"
        weekdays
        label="Photos taken on each day"
      />
    </Card>
  );
}

export function WeekCard({
  insights,
  className,
}: {
  readonly insights: PhotoInsights;
  readonly className: string;
}): ReactNode {
  const matrix = weekMatrix(insights.weekdayByHour);
  const format = useClockFormat();
  return (
    <Card title="Weekday by hour" className={className}>
      <HourHeatmap
        fill
        matrix={matrix}
        rows={WEEK_ROWS}
        unit="photos"
        label="Photos by weekday and hour"
        format={format}
      />
      <Caption text={weekLine(matrix)} />
    </Card>
  );
}

export function SeasonCard({
  insights,
  className,
}: {
  readonly insights: PhotoInsights;
  readonly className: string;
}): ReactNode {
  const matrix = seasonMatrix(insights.seasonByHour);
  const format = useClockFormat();
  return (
    <Card title="Season by hour" className={className}>
      <HourHeatmap
        fill
        matrix={matrix}
        rows={SEASON_ROWS}
        unit="photos"
        label="Photos by season and hour"
        format={format}
      />
      <Caption text={seasonLine(matrix, format)} />
    </Card>
  );
}
