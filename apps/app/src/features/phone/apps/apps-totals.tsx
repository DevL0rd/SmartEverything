import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { ReasonLine } from '../../../components/reason-line';
import { hoursMinutes } from '../../../format/time';
import { AppsWeek } from './apps-week';

export function AppsTotals({
  person,
  installed,
  minutesByDay,
}: {
  readonly person: string;
  readonly installed: number;
  readonly minutesByDay: readonly number[] | null;
}): ReactNode {
  const today = minutesByDay?.at(-1);
  return (
    <View className="gap-section-gap">
      <Card title="Apps" icon="grid">
        <View className="flex-row flex-wrap gap-6">
          <View className="gap-1">
            <Text variant="footnote" tone="variant">
              Installed
            </Text>
            <Figure value={String(installed)} size="l" />
          </View>
          {today === undefined ? null : (
            <View className="gap-1">
              <Text variant="footnote" tone="variant">
                Screen time today
              </Text>
              <Figure value={hoursMinutes(today)} size="l" />
            </View>
          )}
        </View>
      </Card>
      {minutesByDay === null ? null : <AppsWeek minutesByDay={minutesByDay} />}
      <ReasonLine
        icon="lock"
        text={`App names, usage and what is open stay with ${person}. You see counts and totals.`}
      />
    </View>
  );
}
