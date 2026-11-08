import type { ReactNode } from 'react';
import { View } from 'react-native';
import { WATCH_SPORT_LABELS, type WatchWorkout } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { confirm } from '../../components/confirm-store';
import { Figure } from '../../components/figure';
import { IconButton } from '../../components/icon-button';
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

function readingsOf(workout: WatchWorkout): string {
  const figures = workoutFigures(workout);
  return figures === '' ? 'Waiting for the watch’s readings' : figures;
}

function statusOf(workout: WatchWorkout): string {
  return joinParts([WATCH_SPORT_LABELS[workout.sport], STATE_TEXT[workout.state]]);
}

export function WorkoutClock({
  workout,
  compact,
}: {
  readonly workout: WatchWorkout;
  readonly compact: boolean;
}): ReactNode {
  const elapsed = useSecondOf((now) => playTime(elapsedSeconds(workout, now)));
  const tone = workout.state === 'paused' ? 'variant' : 'default';
  if (compact) {
    return (
      <View className="flex-row items-center gap-3">
        <Figure value={elapsed} size="m" tone={tone} />
        <View className="min-w-0 flex-1">
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {statusOf(workout)}
          </Text>
          <Text variant="footnote" numberOfLines={1}>
            {readingsOf(workout)}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View className="gap-0.5">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {statusOf(workout)}
      </Text>
      <Figure value={elapsed} size="xl" tone={tone} />
      <Text variant="callout" numberOfLines={1}>
        {readingsOf(workout)}
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

interface ControlProps {
  readonly workout: WatchWorkout;
  readonly command: WatchCommand;
}

function PauseResume({
  workout,
  command,
  icon,
}: ControlProps & { readonly icon: boolean }): ReactNode {
  const paused = workout.state === 'paused';
  const label = paused ? 'Resume' : 'Pause';
  const onPress = (): void => {
    command.run({ type: paused ? 'resume_workout' : 'pause_workout' });
  };
  return icon ? (
    <IconButton
      icon={paused ? 'play' : 'pause'}
      label={label}
      variant="tonal"
      disabled={command.busy}
      onPress={onPress}
    />
  ) : (
    <Button
      label={label}
      icon={paused ? 'play' : 'pause'}
      variant="tonal"
      loading={command.busy}
      onPress={onPress}
    />
  );
}

function Finish({
  command,
  icon,
}: Pick<ControlProps, 'command'> & { readonly icon: boolean }): ReactNode {
  const onPress = (): void => {
    background(finish(command), 'watch_workout_live.finish_failed');
  };
  return icon ? (
    <IconButton
      icon="square"
      label="Finish"
      variant="raised"
      disabled={command.busy}
      onPress={onPress}
    />
  ) : (
    <Button
      label="Finish"
      icon="square"
      variant="outlined"
      disabled={command.busy}
      onPress={onPress}
    />
  );
}

export function WorkoutActions({
  workout,
  command,
  icons,
}: ControlProps & { readonly icons: boolean }): ReactNode {
  return (
    <>
      <PauseResume workout={workout} command={command} icon={icons} />
      <Finish command={command} icon={icons} />
    </>
  );
}

export function WorkoutControls({ workout, command }: ControlProps): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <WorkoutActions workout={workout} command={command} icons={false} />
    </View>
  );
}
