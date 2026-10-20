import type { ReactNode } from 'react';
import { MetricStrip, type MetricItem } from '../../../components/metric-strip';
import { clock } from '../../../format/time';
import type { FilterId } from './list-view';
import type { Health } from './run-stats';
import type { TimelineEvent } from './timeline-model';

export function healthItems(
  health: Health,
  next: TimelineEvent | null,
  timeZone: string | null,
  onFilter: ((filter: FilterId) => void) | undefined,
): readonly MetricItem[] {
  const press = (filter: FilterId): { readonly onPress?: () => void } =>
    onFilter === undefined
      ? {}
      : {
          onPress: (): void => {
            onFilter(filter);
          },
        };
  return [
    {
      key: 'runs',
      label: 'Runs today',
      value: String(health.runsToday),
      series: health.perHour,
    },
    {
      key: 'failed',
      label: 'Failed today',
      value: String(health.failedToday),
      tone: health.failedToday > 0 ? 'critical' : 'default',
      series: health.failedPerHour,
      ...press('failing'),
    },
    {
      key: 'waiting',
      label: 'Waiting now',
      value: String(health.waiting),
      ...press('running'),
    },
    {
      key: 'next',
      label: 'Next up',
      value: next === null ? 'Nothing' : clock(next.at, timeZone),
      ...(next === null ? {} : { caption: next.name }),
    },
  ];
}

export function HealthStrip({
  health,
  next,
  timeZone,
  onFilter,
}: {
  readonly health: Health;
  readonly next: TimelineEvent | null;
  readonly timeZone: string | null;
  readonly onFilter?: (filter: FilterId) => void;
}): ReactNode {
  return (
    <MetricStrip
      items={healthItems(health, next, timeZone, onFilter)}
      columns={{ compact: 1, medium: 2, expanded: 4 }}
    />
  );
}
