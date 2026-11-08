import type { PlannerStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Bars } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { rounded } from '../../../format/number';
import { usePlannerRings } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import {
  alarmSummaryOf,
  hasAlarmData,
  ringWindowOf,
  spreadWordsOf,
  type AlarmSummary as Summary,
} from './alarm-model';

interface FactProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly caption: string;
}

function Fact({ label, value, unit, caption }: FactProps): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {label}
      </Text>
      <Figure value={value} size="s" {...(unit === undefined ? {} : { unit })} />
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
        {caption}
      </Text>
    </View>
  );
}

function Facts({ summary }: { readonly summary: Summary }): ReactNode {
  return (
    <View className="flex-row gap-3">
      <Fact
        label="Consistency"
        value={spreadWordsOf(summary.spread)}
        {...(summary.spread === null ? {} : { unit: 'min' })}
        caption="wake time"
      />
      <Fact
        label="Snoozes"
        value={String(summary.snoozes)}
        caption={summary.missed === 0 ? 'none missed' : `${String(summary.missed)} missed`}
      />
      <Fact
        label="Up on time"
        value={`${String(summary.upOnTime)} / ${String(summary.ringDays)}`}
        caption="days"
      />
    </View>
  );
}

function SnoozeBars({
  summary,
  range,
}: {
  readonly summary: Summary;
  readonly range: PlannerStats['range'];
}): ReactNode {
  const unit = range === 'week' ? 'day' : 'week';
  return (
    <View className="gap-1">
      <Bars
        bars={summary.snoozeBars}
        colour="primary"
        label={`Snoozes per ${unit}`}
        height={48}
        formatValue={(value) => `${rounded(value, 0)} snoozes`}
      />
      <Text variant="caption" tone="variant">
        {`Snoozes per ${unit}`}
      </Text>
    </View>
  );
}

export function AlarmSummary({ stats }: { readonly stats: PlannerStats }): ReactNode {
  const { person } = usePlannerFrame();
  const window = ringWindowOf(stats);
  const rings = usePlannerRings(person, window.from, window.to).data ?? [];
  const summary = alarmSummaryOf(stats, rings);
  return (
    <Card
      title="Alarms"
      icon="alarmClock"
      action={<Button label="Wake chart" variant="text" href={href.clock.alarms()} />}
    >
      {hasAlarmData(summary) ? (
        <>
          <Facts summary={summary} />
          <SnoozeBars summary={summary} range={stats.range} />
        </>
      ) : (
        <Text variant="footnote" tone="variant">
          {`No alarm rang this ${stats.range}.`}
        </Text>
      )}
    </Card>
  );
}
