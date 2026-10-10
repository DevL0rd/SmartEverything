import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { joinParts } from '../../../format/text';
import { exerciseKindOf } from '../../health-log';
import { dayLabel, startOfDayKey } from '../../../format/time';
import { workoutFacts } from '../model/workout-facts';
import type { Workout } from '../model/workouts';

export function WorkoutIcon({ workout }: { readonly workout: Workout }): ReactNode {
  return (
    <View className="size-10 items-center justify-center rounded-full bg-exercise/16">
      <Icon name={exerciseKindOf(workout.code).icon} size={20} />
    </View>
  );
}

export function WorkoutRow({
  workout,
  today,
}: {
  readonly workout: Workout;
  readonly today: string;
}): ReactNode {
  const facts = workoutFacts(workout)
    .slice(0, 2)
    .map((fact) => fact.text);
  return (
    <ListRow
      leading={<WorkoutIcon workout={workout} />}
      title={workout.title ?? workout.name}
      subtitle={joinParts([dayLabel(workout.start, startOfDayKey(today)), ...facts])}
      href={href.workout(workout.recordId)}
      chevron
    />
  );
}
