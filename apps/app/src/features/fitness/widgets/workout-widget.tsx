import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WidgetFrame, boardClassOf, type WidgetSize } from '../../../components/widget-board';
import { useSizeClass } from '../../../design/size-class';
import { useTodayContext } from '../data/today';
import { useLatestWorkout } from '../data/workouts';
import { exerciseKindOf } from '../../health-log';
import { workoutFacts } from '../model/workout-facts';
import { QuickStats } from '../components/glance-parts';
import { clock, dayLabel, startOfDayKey } from '../../../format/time';

export function WorkoutWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const { day } = useTodayContext();
  const { workout } = useLatestWorkout(day);
  const compact = boardClassOf(useSizeClass().width) === 'compact';
  return (
    <WidgetFrame
      title="Latest workout"
      icon="dumbbell"
      accent="exercise"
      size={size}
      {...(workout === null ? {} : { href: href.workout(workout.recordId) })}
    >
      {workout === null ? null : (
        <View className="flex-1 justify-between gap-3">
          <View className="flex-row items-center gap-3">
            <IconWell icon={exerciseKindOf(workout.code).icon} colour="exercise" size="l" />
            <View className="min-w-0 flex-1">
              <Text variant="title-3" numberOfLines={1}>
                {workout.title ?? workout.name}
              </Text>
              <Text variant="footnote" tone="variant" numberOfLines={1}>
                {`${dayLabel(workout.start, startOfDayKey(day))} · ${clock(workout.start)}`}
              </Text>
            </View>
          </View>
          <QuickStats
            stats={workoutFacts(workout)
              .slice(0, compact ? 3 : size === 'W' ? 5 : 4)
              .map((fact) => ({ label: fact.label, value: fact.text }))}
          />
        </View>
      )}
    </WidgetFrame>
  );
}
