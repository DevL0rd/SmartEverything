import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { percent } from '../../../format/number';
import { useRecords } from '../data/queries';
import { hoursMinutes } from '../../../format/time';
import { recordsOfType } from '../model/records';
import { patternOf, sleepDaysOf } from '../model/sleep';
import { clockOfMinutes } from '../../../format/time';
import { type Window } from '../model/window';
import { StatList } from './stat-list';

export function SleepPatternCard({ window }: { readonly window: Window }): ReactNode {
  const records = useRecords(['SleepSession'], window.start, window.end);
  const days = sleepDaysOf(recordsOfType(records.data ?? [], 'SleepSession'));
  const pattern = patternOf(days);
  if (pattern === null || pattern.nights < 2) {
    return null;
  }
  return (
    <Card title="Schedule" icon="clock">
      <StatList
        stats={[
          { label: 'Usual bedtime', value: clockOfMinutes(pattern.usualBedtime) },
          { label: 'Usual wake-up', value: clockOfMinutes(pattern.usualWake) },
          { label: 'Average asleep', value: hoursMinutes(pattern.averageAsleep) },
          {
            label: 'On schedule',
            value: percent(pattern.regularity),
            note: `${String(pattern.nights)} nights`,
          },
        ]}
      />
    </Card>
  );
}
