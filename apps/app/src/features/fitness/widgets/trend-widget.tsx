import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { DayAxis, FillChart } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { WidgetFrame, type WidgetSize } from '../../../components/widget-board';
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
    <View className="flex-row items-baseline gap-2">
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

export function TrendWidget({
  spec,
  days,
  size,
}: {
  readonly spec: DailySpec;
  readonly days: number;
  readonly size: WidgetSize;
}): ReactNode {
  const { figures, day } = useTodayContext();
  const glance = glanceOf(figures, { metric: spec.daily, day, days, better: spec.better });
  const tall = size === 'L' || size === 'XL';
  return (
    <WidgetFrame
      title={`${spec.label} · ${String(days)} days`}
      icon={spec.icon}
      accent={spec.colour}
      href={href.healthMetric(spec.key, { day, range: days <= 7 ? 'week' : 'month' })}
      size={size}
    >
      <View className="flex-1 gap-2">
        <Headline spec={spec} glance={glance} tall={tall} />
        <FillChart
          values={glance.values}
          kind={spec.chart === 'bars' ? 'bars' : 'line'}
          colour={spec.colour}
          reference={glance.average}
          label={`${spec.label}, last ${String(days)} days`}
        />
        {days <= 7 ? <DayAxis days={glance.values.map((item) => item.key)} /> : null}
        {tall ? <Stats spec={spec} glance={glance} /> : null}
      </View>
    </WidgetFrame>
  );
}
