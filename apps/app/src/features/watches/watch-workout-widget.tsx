import type { ReactNode } from 'react';
import { View } from 'react-native';
import { WATCH_SPORT_LABELS, type WidgetSize } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { WidgetFrame, type WidgetDefinition } from '../../components/widget-board';
import { allSizes, isTile } from '../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../components/widget-board/use-widget-face';
import type { Device } from '../../store/state';
import { useWatchCommand } from './watch-config';
import { useMyWatch } from './watch-glance';
import { useWatchWorkout } from './watch-workout';
import { WorkoutClock, WorkoutControls } from './watch-workout-live';

function WorkoutContent({
  watch,
}: {
  readonly watch: Device;
  readonly size: WidgetSize;
}): ReactNode {
  const view = useWatchWorkout(watch);
  const command = useWatchCommand(watch);
  const tile = isTile(useWidgetFace().cls);
  if (view.reading.kind === 'invalid') {
    return (
      <Text variant="callout" tone="critical">
        {view.reading.reason}
      </Text>
    );
  }
  const { workout } = view.reading;
  const first = view.sports[0];
  if (workout === null || workout.state === 'finished') {
    return first === undefined ? (
      <Text variant="callout" tone="variant">
        The watch hasn’t said which workouts it can start yet.
      </Text>
    ) : (
      <View className="flex-1 justify-end">
        <Button
          label={`Start ${WATCH_SPORT_LABELS[first].toLowerCase()}`}
          icon="play"
          loading={command.busy}
          onPress={() => {
            command.run({ type: 'start_workout', sport: first });
          }}
        />
      </View>
    );
  }
  return (
    <View className="flex-1 justify-between gap-2">
      <WorkoutClock workout={workout} compact />
      {tile ? null : <WorkoutControls workout={workout} command={command} />}
    </View>
  );
}

function WatchWorkoutWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const watch = useMyWatch();
  return (
    <WidgetFrame
      title="Workout"
      icon="activity"
      accent="viz-2"
      href={watch === null ? href.connect('watch') : href.device(watch)}
    >
      {watch === null ? (
        <Text variant="callout" tone="variant">
          Add your watch to start workouts from here.
        </Text>
      ) : (
        <WorkoutContent watch={watch} size={size} />
      )}
    </WidgetFrame>
  );
}

export const WATCH_WORKOUT_WIDGET: WidgetDefinition = {
  type: 'watch-workout',
  title: 'Watch workout',
  icon: 'activity',
  sizes: allSizes('M', 'W'),
  defaultSize: 'M',
  render: ({ size }) => <WatchWorkoutWidget size={size} />,
};
