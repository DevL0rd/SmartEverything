import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WidgetEmpty, WidgetFrame } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useTodayContext } from '../data/today';
import { useLatestWorkout } from '../data/workouts';
import { exerciseKindOf } from '../../health-log';
import type { Workout } from '../model/workouts';
import { workoutFacts } from '../model/workout-facts';
import { QuickStats } from '../components/glance-parts';
import { clock, dayLabel, startOfDayKey } from '../../../format/time';
import { workoutFactCount } from './workout-facts-count';

function Latest({ workout }: { readonly workout: Workout }): ReactNode {
  const { day } = useTodayContext();
  const { cls, frame } = useWidgetFace();
  return (
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
          .slice(0, workoutFactCount(cls, frame))
          .map((fact) => ({ label: fact.label, value: fact.text }))}
      />
    </View>
  );
}

function Content({
  workout,
  loaded,
}: {
  readonly workout: Workout | null;
  readonly loaded: boolean;
}): ReactNode {
  if (workout !== null) {
    return <Latest workout={workout} />;
  }
  return loaded ? (
    <WidgetEmpty icon="dumbbell" colour="exercise" title="No workouts in the last 30 days" />
  ) : null;
}

export function WorkoutWidget(): ReactNode {
  const { day } = useTodayContext();
  const { workout, loaded } = useLatestWorkout(day);
  return (
    <WidgetFrame
      title="Latest workout"
      icon="dumbbell"
      accent="exercise"
      {...(workout === null ? {} : { href: href.workout(workout.recordId) })}
    >
      <Content workout={workout} loaded={loaded} />
    </WidgetFrame>
  );
}
