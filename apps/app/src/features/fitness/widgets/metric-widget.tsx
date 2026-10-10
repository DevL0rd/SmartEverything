import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { WidgetSize } from '../../../components/widget-board';
import { clock, dayTitle } from '../../../format/time';
import { joinParts } from '../../../format/text';
import { useSyncedAt } from '../data/synced-at';
import { useTodayContext } from '../data/today';
import { formatAmount } from '../model/catalogue';
import { glanceOf } from '../model/glance';
import type { DailySpec } from '../model/metric-choices';
import { ReadingWidget } from './reading-widget';

const DAYS = 14;

function sumCaption(spec: DailySpec, syncedAt: string | null, average: number | null): string {
  return joinParts([
    syncedAt === null ? null : `As of ${clock(syncedAt)}`,
    average === null ? null : `avg ${formatAmount(spec, average)} ${spec.unit}`.trim(),
  ]);
}

export function MetricWidget({
  spec,
  size,
}: {
  readonly spec: DailySpec;
  readonly size: WidgetSize;
}): ReactNode {
  const { figures, day, today } = useTodayContext();
  const glance = glanceOf(figures, { metric: spec.daily, day, days: DAYS, better: spec.better });
  const partial = spec.combine === 'sum';
  const average = glance.average;
  const syncedAt = useSyncedAt(spec.daily, glance.latest?.day ?? null);
  const caption = partial ? sumCaption(spec, syncedAt, size === 'S' ? null : average) : '';
  return (
    <ReadingWidget
      title={dayTitle(size === 'S' ? (spec.short ?? spec.label) : spec.label, day, today)}
      icon={spec.icon}
      href={href.healthMetric(spec.key, { day })}
      size={size}
      day={day}
      glance={partial ? { ...glance, delta: null } : glance}
      {...(caption === '' ? {} : { caption })}
      format={(value) => formatAmount(spec, value)}
      digits={spec.digits}
      unit={spec.unit}
      colour={spec.colour}
      kind={spec.chart === 'bars' ? 'bars' : 'line'}
      against="7-day avg"
      empty="No data in the last 90 days"
    />
  );
}
