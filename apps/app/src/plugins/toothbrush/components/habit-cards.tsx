import type { BrushingStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { DayCalendar } from '../charts/day-calendar';
import { YearHeatmap } from '../charts/year-heatmap';
import { heatGrid, monthCalendar } from '../model/calendar-model';
import { goalDots, recordsOf } from '../model/stats-model';
import { streakLine } from '../model/today-model';

export function RecordsCard({ stats }: { readonly stats: BrushingStats }): ReactNode {
  return (
    <Card title="Personal bests" icon="trophy">
      <View className="gap-3">
        {recordsOf(stats).map((record) => (
          <View key={record.label} className="flex-row items-baseline justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text variant="body-strong">{record.label}</Text>
              {record.when === null ? null : (
                <Text variant="caption" tone="variant">
                  {record.when}
                </Text>
              )}
            </View>
            <Text variant="body-strong" className="tabular">
              {record.value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function GoalDots({ stats }: { readonly stats: BrushingStats }): ReactNode {
  const dots = goalDots(stats);
  const reached = dots.filter(Boolean).length;
  return (
    <View
      accessible
      accessibilityLabel={`Goal reached on ${String(reached)} of the last ${String(dots.length)} days`}
      className="flex-row gap-2"
    >
      {dots.map((done, index) => (
        <Icon
          key={index}
          name={done ? 'circleCheck' : 'circle'}
          size={20}
          tone={done ? 'positive' : 'faint'}
        />
      ))}
    </View>
  );
}

export function StreakCard({ stats }: { readonly stats: BrushingStats }): ReactNode {
  const { streak } = stats;
  return (
    <Card title="Streak" icon="flame">
      <View className="gap-3">
        <View className="flex-row items-center gap-2">
          <Icon name="flame" size={24} tone={streak.current > 0 ? 'warning' : 'faint'} />
          <Text variant="body-strong">{streakLine(streak.current, streak.longest)}</Text>
        </View>
        <GoalDots stats={stats} />
      </View>
    </Card>
  );
}

export function CalendarCard({ stats }: { readonly stats: BrushingStats }): ReactNode {
  return (
    <Card title="Calendar" icon="calendar">
      {stats.range === 'month' ? (
        <DayCalendar cells={monthCalendar(stats)} label="Brushes per day this month" />
      ) : (
        <YearHeatmap grid={heatGrid(stats)} />
      )}
    </Card>
  );
}
