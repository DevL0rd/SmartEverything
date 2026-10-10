import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { WATCH_SPORT_LABELS, type WatchSport, type WatchWorkout } from '@smarteverything/domain';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { SelectRow } from '../../components/rows';
import { Text } from '../../components/text';
import { playTime } from '../../format/time';
import { joinParts } from '../../format/text';
import type { Device } from '../../store/state';
import { useWatchCommand, type WatchCommand } from './watch-config';
import {
  SPORT_ICONS,
  elapsedSeconds,
  useWatchWorkout,
  type WatchWorkoutView,
} from './watch-workout';
import { WorkoutClock, WorkoutControls, workoutFigures } from './watch-workout-live';

function LastWorkout({ workout }: { readonly workout: WatchWorkout }): ReactNode {
  return (
    <Text variant="footnote" tone="variant">
      {joinParts([
        `Last: ${WATCH_SPORT_LABELS[workout.sport]}`,
        playTime(elapsedSeconds(workout, Date.parse(workout.updatedAt))),
        workoutFigures(workout),
      ])}
      {' — it appears in Fitness after the watch syncs.'}
    </Text>
  );
}

function StartControls({
  sports,
  command,
}: {
  readonly sports: readonly WatchSport[];
  readonly command: WatchCommand;
}): ReactNode {
  const [sport, setSport] = useState<WatchSport>(sports[0] ?? 'treadmill');
  return (
    <View className="gap-3">
      <View className="overflow-hidden rounded-md border-hairline border-outline-variant">
        <SelectRow
          title="Sport"
          icon={SPORT_ICONS[sport]}
          options={sports.map((value) => ({ value, label: WATCH_SPORT_LABELS[value] }))}
          value={sport}
          onChange={setSport}
        />
      </View>
      <Button
        label={`Start ${WATCH_SPORT_LABELS[sport].toLowerCase()}`}
        icon="play"
        loading={command.busy}
        onPress={() => {
          command.run({ type: 'start_workout', sport });
        }}
      />
    </View>
  );
}

function WorkoutBody({
  sports,
  workout,
  command,
}: {
  readonly sports: readonly WatchSport[];
  readonly workout: WatchWorkout | null;
  readonly command: WatchCommand;
}): ReactNode {
  if (workout !== null && workout.state !== 'finished') {
    return (
      <View className="gap-4">
        <WorkoutClock workout={workout} compact={false} />
        <WorkoutControls workout={workout} command={command} />
      </View>
    );
  }
  return (
    <View className="gap-3">
      <StartControls sports={sports} command={command} />
      {workout === null ? null : <LastWorkout workout={workout} />}
    </View>
  );
}

export function WatchWorkoutPanel({
  device,
  view,
}: {
  readonly device: Device;
  readonly view: WatchWorkoutView;
}): ReactNode {
  const command = useWatchCommand(device);
  if (view.reading.kind === 'invalid') {
    return <Banner tone="critical" title="The workout can’t be shown" body={view.reading.reason} />;
  }
  return (
    <View className="gap-3">
      {command.outcome === null || command.outcome.ok ? null : (
        <Banner tone="critical" title="The watch didn’t do that" body={command.outcome.detail} />
      )}
      <WorkoutBody sports={view.sports} workout={view.reading.workout} command={command} />
    </View>
  );
}

export function hasWorkoutToShow(view: WatchWorkoutView): boolean {
  return view.reading.kind === 'invalid' || view.sports.length > 0 || view.reading.workout !== null;
}

export function WatchWorkoutCard({ device }: { readonly device: Device }): ReactNode {
  const view = useWatchWorkout(device);
  if (!hasWorkoutToShow(view)) {
    return null;
  }
  return (
    <Card title="Workout" icon="activity">
      <WatchWorkoutPanel device={device} view={view} />
    </Card>
  );
}
