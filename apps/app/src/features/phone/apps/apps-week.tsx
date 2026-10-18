import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { Bars } from '../../../components/charts';
import { Text } from '../../../components/text';
import { hoursMinutes } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { todayKeyOf, weekBarsOf } from '../model/apps-model';

const BARS_HEIGHT = 140;

export function summaryOfWeek(minutes: readonly number[]): string {
  const today = minutes.at(-1);
  return today === undefined ? 'No screen time yet' : `${hoursMinutes(today)} today`;
}

export function AppsWeek({
  minutesByDay,
}: {
  readonly minutesByDay: readonly number[];
}): ReactNode {
  const now = useMinute();
  return (
    <Card title="Screen time this week" icon="timer">
      <Text variant="footnote" tone="variant">
        All apps together, last 7 days
      </Text>
      <Bars
        bars={weekBarsOf(minutesByDay, now)}
        colour="viz-1"
        label={`Screen time per day, ${summaryOfWeek(minutesByDay)}`}
        height={BARS_HEIGHT}
        highlightKey={todayKeyOf(minutesByDay)}
        formatValue={(value) => hoursMinutes(value)}
      />
    </Card>
  );
}
