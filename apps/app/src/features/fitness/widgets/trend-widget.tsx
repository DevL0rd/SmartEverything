import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { DayAxis, FillChart } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { WidgetFrame } from '../../../components/widget-board';
import { faceLayoutOf } from '../../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { QuickStats } from '../components/glance-parts';
import { useTodayContext } from '../data/today';
import { formatAmount } from '../model/catalogue';
import { glanceOf, type MetricGlance } from '../model/glance';
import type { DailySpec } from '../model/metric-choices';

function shownOf(spec: DailySpec): (value: number | null) => string {
  return (value) => (value === null ? '—' : formatAmount(spec, value));
}

function Headline({
  spec,
  glance,
  tall,
}: {
  readonly spec: DailySpec;
  readonly glance: MetricGlance;
  readonly tall: boolean;
}): ReactNode {
  const latest = spec.combine === 'latest';
  return (
    <View className="flex-row flex-wrap items-baseline gap-x-2">
      <Figure
        value={shownOf(spec)(latest ? (glance.latest?.value ?? null) : glance.average)}
        unit={spec.unit}
        size={tall ? 'm' : 's'}
      />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {latest ? 'Latest' : 'Daily average'}
      </Text>
    </View>
  );
}

function Stats({
  spec,
  glance,
}: {
  readonly spec: DailySpec;
  readonly glance: MetricGlance;
}): ReactNode {
  const shown = shownOf(spec);
  const logged = glance.values.filter((item) => item.value !== null).length;
  return (
    <QuickStats
      stats={[
        { label: 'Lowest', value: shown(glance.low) },
        { label: 'Highest', value: shown(glance.high) },
        { label: 'Days with data', value: String(logged) },
      ]}
    />
  );
}

function Chart({
  spec,
  glance,
  days,
}: {
  readonly spec: DailySpec;
  readonly glance: MetricGlance;
  readonly days: number;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <FillChart
        values={glance.values}
        kind={spec.chart === 'bars' ? 'bars' : 'line'}
        colour={spec.colour}
        reference={glance.average}
        label={`${spec.label}, last ${String(days)} days`}
      />
      {days <= 7 ? <DayAxis days={glance.values.map((item) => item.key)} /> : null}
    </View>
  );
}

function Body({
  spec,
  glance,
  days,
}: {
  readonly spec: DailySpec;
  readonly glance: MetricGlance;
  readonly days: number;
}): ReactNode {
  const layout = faceLayoutOf(useWidgetFace().cls);
  if (layout === 'wide') {
    return (
      <View className="flex-1 flex-row gap-6">
        <View className="w-1/4">
          <Headline spec={spec} glance={glance} tall />
        </View>
        <Chart spec={spec} glance={glance} days={days} />
      </View>
    );
  }
  const tall = layout === 'tall' || layout === 'report';
  return (
    <View className="flex-1 gap-0.5">
      <Headline spec={spec} glance={glance} tall={tall} />
      <Chart spec={spec} glance={glance} days={days} />
      {tall ? <Stats spec={spec} glance={glance} /> : null}
    </View>
  );
}

export function TrendWidget({
  spec,
  days,
}: {
  readonly spec: DailySpec;
  readonly days: number;
}): ReactNode {
  const { figures, day } = useTodayContext();
  const glance = glanceOf(figures, { metric: spec.daily, day, days, better: spec.better });
  return (
    <WidgetFrame
      title={`${spec.label} · ${String(days)} days`}
      icon={spec.icon}
      accent={spec.colour}
      href={href.healthMetric(spec.key, { day, range: days <= 7 ? 'week' : 'month' })}
    >
      <Body spec={spec} glance={glance} days={days} />
    </WidgetFrame>
  );
}
