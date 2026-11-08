import type { ReactNode } from 'react';
import { WATCH_SPORT_LABELS, type WatchSport } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { WidgetFrame, type WidgetDefinition } from '../../components/widget-board';
import { allSizes, isTile } from '../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../components/widget-board/use-widget-face';
import type { Device } from '../../store/state';
import { useWatchCommand, type WatchCommand } from './watch-config';
import { useMyWatch } from './watch-glance';
import { useWatchWorkout, type WatchWorkoutView } from './watch-workout';
import { WorkoutActions, WorkoutClock } from './watch-workout-live';

interface Shown {
  readonly body: ReactNode;
  readonly actions: ReactNode;
}

function StartButton({
  sport,
  command,
}: {
  readonly sport: WatchSport;
  readonly command: WatchCommand;
}): ReactNode {
  return (
    <Button
      label={`Start ${WATCH_SPORT_LABELS[sport].toLowerCase()}`}
      icon="play"
      loading={command.busy}
      onPress={() => {
        command.run({ type: 'start_workout', sport });
      }}
    />
  );
}

function shownOf(view: WatchWorkoutView, command: WatchCommand, tile: boolean): Shown {
  if (view.reading.kind === 'invalid') {
    return {
      body: (
        <Text variant="callout" tone="critical">
          {view.reading.reason}
        </Text>
      ),
      actions: undefined,
    };
  }
  const { workout } = view.reading;
  if (workout !== null && workout.state !== 'finished') {
    return {
      body: <WorkoutClock workout={workout} compact />,
      actions: <WorkoutActions workout={workout} command={command} icons={tile} />,
    };
  }
  const first = view.sports[0];
  return first === undefined
    ? {
        body: (
          <Text variant="callout" tone="variant">
            The watch hasn’t said which workouts it can start yet.
          </Text>
        ),
        actions: undefined,
      }
    : { body: null, actions: <StartButton sport={first} command={command} /> };
}

function WorkoutFrame({
  watch,
  children,
  actions,
}: {
  readonly watch: Device | null;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
}): ReactNode {
  return (
    <WidgetFrame
      title="Workout"
      icon="activity"
      accent="viz-2"
      href={watch === null ? href.connect('watch') : href.device(watch)}
      actions={actions}
    >
      {children}
    </WidgetFrame>
  );
}

function WorkoutContent({ watch }: { readonly watch: Device }): ReactNode {
  const view = useWatchWorkout(watch);
  const command = useWatchCommand(watch);
  const tile = isTile(useWidgetFace().cls);
  const { body, actions } = shownOf(view, command, tile);
  return (
    <WorkoutFrame watch={watch} actions={actions}>
      {body}
    </WorkoutFrame>
  );
}

function WatchWorkoutWidget(): ReactNode {
  const watch = useMyWatch();
  return watch === null ? (
    <WorkoutFrame watch={null}>
      <Text variant="callout" tone="variant">
        Add your watch to start workouts from here.
      </Text>
    </WorkoutFrame>
  ) : (
    <WorkoutContent watch={watch} />
  );
}

export const WATCH_WORKOUT_WIDGET: WidgetDefinition = {
  type: 'watch-workout',
  title: 'Watch workout',
  icon: 'activity',
  sizes: allSizes('M', 'W'),
  defaultSize: 'M',
  render: () => <WatchWorkoutWidget />,
};
