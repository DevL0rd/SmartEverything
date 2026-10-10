import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { FillChart } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { WidgetFrame, boardClassOf, type WidgetSize } from '../../../components/widget-board';
import { useSizeClass } from '../../../design/size-class';
import { decimal } from '../../../format/number';
import { AgeBadge } from '../components/age-badge';
import { DeltaLine, QuickStats } from '../components/glance-parts';
import { HeartRange } from '../components/heart-range';
import { useTodayContext } from '../data/today';
import { figureOn } from '../model/daily';
import { freshnessOf } from '../model/freshness';
import { glanceOf, type MetricGlance } from '../model/glance';
import { heartRangeOf, hasMetric, type HeartRange as Range } from '../model/today';

const DAYS = 14;

interface HeartView {
  readonly range: Range;
  readonly average: number | null;
  readonly trend: MetricGlance;
  readonly resting: boolean;
  readonly day: string;
}

function bpm(value: number): string {
  return decimal(value);
}

function Baseline({ view, big }: { readonly view: HeartView; readonly big: boolean }): ReactNode {
  const latest = view.trend.latest;
  if (latest === null) {
    return null;
  }
  return (
    <View className="gap-0.5">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {view.resting ? 'Resting' : 'Average'}
      </Text>
      <Figure
        value={bpm(latest.value)}
        unit="bpm"
        size={big ? 'l' : 'm'}
        stale={freshnessOf(latest.day, view.day).stale}
      />
      {view.trend.delta === null || !big ? null : (
        <DeltaLine delta={view.trend.delta} digits={0} unit="bpm" against="usual" />
      )}
    </View>
  );
}

function TodayRange({ view }: { readonly view: HeartView }): ReactNode {
  const { range } = view;
  const resting = view.trend.latest?.value ?? null;
  return (
    <View className="gap-1.5">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {range.day === view.day ? 'Range today' : 'Range'}
      </Text>
      <Figure value={`${bpm(range.low)}–${bpm(range.high)}`} unit="bpm" size="s" />
      <HeartRange low={range.low} high={range.high} resting={view.resting ? resting : null} />
      {view.average === null ? null : (
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {`Average ${bpm(view.average)} bpm`}
        </Text>
      )}
    </View>
  );
}

function Trend({ view }: { readonly view: HeartView }): ReactNode {
  return (
    <FillChart
      values={view.trend.values}
      kind="line"
      colour="heart"
      reference={view.trend.average}
      label={`${view.resting ? 'Resting' : 'Average'} heart rate, last 2 weeks`}
    />
  );
}

function Tile({ view }: { readonly view: HeartView }): ReactNode {
  return (
    <View className="flex-1 justify-between gap-2">
      <Baseline view={view} big={false} />
      <HeartRange
        low={view.range.low}
        high={view.range.high}
        resting={view.trend.latest?.value ?? null}
      />
    </View>
  );
}

function Tall({ view }: { readonly view: HeartView }): ReactNode {
  const shown = (value: number | null): string => (value === null ? '—' : `${bpm(value)} bpm`);
  return (
    <View className="flex-1 gap-3">
      <View className="flex-row gap-6">
        <View className="min-w-0 flex-1">
          <Baseline view={view} big />
        </View>
        <View className="min-w-0 flex-1">
          <TodayRange view={view} />
        </View>
      </View>
      <Trend view={view} />
      <QuickStats
        stats={[
          { label: '2-week average', value: shown(view.trend.average) },
          { label: 'Lowest', value: shown(view.trend.low) },
          { label: 'Highest', value: shown(view.trend.high) },
        ]}
      />
    </View>
  );
}

function Row({ view, wide }: { readonly view: HeartView; readonly wide: boolean }): ReactNode {
  return (
    <View className="flex-1 flex-row gap-5">
      <View className={wide ? 'w-40 justify-center' : 'min-w-0 flex-1 justify-center'}>
        <Baseline view={view} big />
      </View>
      {wide ? <Trend view={view} /> : null}
      <View className={wide ? 'w-56 justify-center' : 'min-w-0 flex-1 justify-center'}>
        <TodayRange view={view} />
      </View>
    </View>
  );
}

function Body({
  view,
  size,
  compact,
}: {
  readonly view: HeartView;
  readonly size: WidgetSize;
  readonly compact: boolean;
}): ReactNode {
  if (size === 'S') {
    return <Tile view={view} />;
  }
  if (size === 'L' || size === 'XL') {
    return <Tall view={view} />;
  }
  return <Row view={view} wide={size === 'W' && !compact} />;
}

export function HeartWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const { figures, day } = useTodayContext();
  const compact = boardClassOf(useSizeClass().width) === 'compact';
  const range = heartRangeOf(figures, day);
  const resting = hasMetric(figures, 'resting_heart_rate');
  const metric = resting ? 'resting_heart_rate' : 'heart_rate_average';
  return (
    <WidgetFrame
      title="Heart rate"
      icon="heartPulse"
      accent="heart"
      href={href.fitnessPage('heart', { day })}
      action={range === null ? undefined : <AgeBadge day={range.day} selected={day} />}
      size={size}
    >
      {range === null ? (
        <Text variant="callout" tone="variant">
          No heart rate before this day
        </Text>
      ) : (
        <Body
          view={{
            range,
            average: figureOn(figures, range.day, 'heart_rate_average'),
            trend: glanceOf(figures, { metric, day, days: DAYS, better: 'lower' }),
            resting,
            day,
          }}
          size={size}
          compact={compact}
        />
      )}
    </WidgetFrame>
  );
}
