import type { ReactNode } from 'react';
import { use } from 'react';
import type { HealthMetric } from '@smarteverything/domain';
import { useToday } from './data/day';
import { TodayContext, useTodayData } from './data/today';
import { SERIES } from './model/catalogue';

function OwnToday({ children }: { readonly children: ReactNode }): ReactNode {
  const today = useToday();
  const data = useTodayData(today, today);
  return <TodayContext value={data}>{children}</TodayContext>;
}

export function DayScope({
  day,
  children,
}: {
  readonly day: string;
  readonly children: ReactNode;
}): ReactNode {
  const today = useToday();
  const data = useTodayData(day, today);
  return <TodayContext value={data}>{children}</TodayContext>;
}

export function TodayScope({ children }: { readonly children: ReactNode }): ReactNode {
  return use(TodayContext) === null ? <OwnToday>{children}</OwnToday> : children;
}

export function dailySeriesKeyOf(metric: HealthMetric): string | null {
  return SERIES.find((spec) => spec.daily === metric)?.key ?? null;
}
