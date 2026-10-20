import type { BottleStats, BottleStatusView } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { millilitres } from '../../../format/number';
import { paceOf, type ChipTone } from './bottle-model';
import { dayHeading } from './calendar-model';
import { streakLine } from './stats-model';

export interface Insight {
  readonly key: string;
  readonly label: string;
  readonly tone: ChipTone;
  readonly icon: IconName;
}

function paceInsight(view: BottleStatusView, minuteOfDay: number): readonly Insight[] {
  const pace = paceOf(view.today, minuteOfDay);
  if (pace.expectedMl === 0) {
    return [];
  }
  return [
    {
      key: 'pace',
      label: pace.text,
      tone: pace.deltaMl >= 0 ? 'positive' : 'warning',
      icon: pace.deltaMl >= 0 ? 'trendUp' : 'trendDown',
    },
  ];
}

function bestDayInsight(stats: BottleStats): readonly Insight[] {
  const month = stats.today.slice(0, 7);
  const best = stats.heatmap
    .filter((entry) => entry.day.startsWith(month) && entry.ml > 0)
    .reduce<(typeof stats.heatmap)[number] | null>(
      (top, entry) => (top === null || entry.ml > top.ml ? entry : top),
      null,
    );
  if (best === null) {
    return [];
  }
  const label =
    best.day === stats.today
      ? 'Today is your best day this month'
      : `Best day this month: ${millilitres(Math.round(best.ml))} on ${dayHeading(best.day)}`;
  return [{ key: 'best-day', label, tone: 'info', icon: 'trophy' }];
}

function streakInsight(stats: BottleStats): readonly Insight[] {
  return stats.streak.current === 0
    ? []
    : [{ key: 'streak', label: streakLine(stats.streak), tone: 'warning', icon: 'flame' }];
}

export function insightsOf(
  view: BottleStatusView,
  stats: BottleStats | undefined,
  minuteOfDay: number,
): readonly Insight[] {
  if (view.firstSyncPending) {
    return [];
  }
  return [
    ...paceInsight(view, minuteOfDay),
    ...(stats === undefined ? [] : [...bestDayInsight(stats), ...streakInsight(stats)]),
  ];
}
