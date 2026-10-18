import type { ReactNode } from 'react';
import { View } from 'react-native';
import { WATCH_SPORT_LABELS, type WatchWorkout } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { confirm } from '../../components/confirm-store';
import { Figure } from '../../components/figure';
import { Text } from '../../components/text';
import { count, kilometres } from '../../format/number';
import { playTime } from '../../format/time';
import { joinParts } from '../../format/text';
import { useSecondOf } from '../../store/clock';
import type { WatchCommand } from './watch-config';
import { elapsedSeconds } from './watch-workout';
import { background } from '@smarteverything/logging';

const STATE_TEXT: Readonly<Record<WatchWorkout['state'], string>> = {
  running: 'On the watch now',
  paused: 'Paused',
  finished: 'Finished',
};

export function workoutFigures(workout: WatchWorkout): string {
  return joinParts([
    workout.heartRate === null ? null : `${String(workout.heartRate)} bpm`,
    workout.kcal === null ? null : `${count(workout.kcal)} kcal`,
    workout.steps === null ? null : `${count(workout.steps)} steps`,
    workout.distanceM === null || workout.distanceM === 0 ? null : kilometres(workout.distanceM),
  ]);
}

export function WorkoutClock({
  workout,
  compact,
}: {
  readonly workout: WatchWorkout;
  readonly compact: boolean;
}): ReactNode {
  const elapsed = useSecondOf((now) => playTime(elapsedSeconds(workout, now)));
  return (
    <View className="gap-0.5">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {joinParts([WATCH_SPORT_LABELS[workout.sport], STATE_TEXT[workout.state]])}
      </Text>
      <Figure
        value={elapsed}
        size={compact ? 'l' : 'xl'}
        tone={workout.state === 'paused' ? 'variant' : 'default'}
      />
      <Text variant="callout" numberOfLines={1}>
        {workoutFigures(workout) === ''
          ? 'Waiting for the watch’s readings'
          : workoutFigures(workout)}
      </Text>
    </View>
  );
}

async function finish(command: WatchCommand): Promise<void> {
  const accepted = await confirm({
    title: 'Finish the workout?',
    body: 'The watch saves it and it appears in Fitness after the next sync.',
    confirmLabel: 'Finish',
  });
  if (accepted) {
    command.run({ type: 'stop_workout' });
  }
}

export function WorkoutControls({
  workout,
  command,
}: {
  readonly workout: WatchWorkout;
  readonly command: WatchCommand;
}): ReactNode {
  const paused = workout.state === 'paused';
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label={paused ? 'Resume' : 'Pause'}
        icon={paused ? 'play' : 'pause'}
        variant="tonal"
        loading={command.busy}
        onPress={() => {
          command.run({ type: paused ? 'resume_workout' : 'pause_workout' });
        }}
      />
      <Button
        label="Finish"
        icon="square"
        variant="outlined"
        disabled={command.busy}
        onPress={() => {
          background(finish(command), 'watch_workout_live.finish_failed');
        }}
      />
    </View>
  );
}
