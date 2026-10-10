import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { IconWell } from '../../components/icon-well';
import type { PrimaryActionProps } from '../../components/primary-action';
import { Sheet } from '../../components/sheet';
import { Text } from '../../components/text';
import type { Device } from '../../store/state';
import { hasWorkoutToShow, WatchWorkoutPanel } from './watch-workout-card';
import { useMyWatch } from './watch-glance';
import { isRunning, useWatchWorkout } from './watch-workout';

function SheetNotice({
  title,
  body,
  action,
}: {
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <View className="gap-3 pb-2">
      <View className="flex-row items-center gap-3">
        <IconWell icon="watch" colour="primary" />
        <View className="flex-1 gap-0.5">
          <Text variant="body-strong">{title}</Text>
          <Text variant="footnote" tone="variant">
            {body}
          </Text>
        </View>
      </View>
      {action}
    </View>
  );
}

function SheetBody({ watch }: { readonly watch: Device }): ReactNode {
  const view = useWatchWorkout(watch);
  if (!hasWorkoutToShow(view)) {
    return (
      <SheetNotice
        title="Workouts show up soon"
        body="They appear once your watch tells this phone which workouts it can start."
      />
    );
  }
  return <WatchWorkoutPanel device={watch} view={view} />;
}

function WorkoutSheet({
  watch,
  onClose,
}: {
  readonly watch: Device | null;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open onClose={onClose} title="Workout" detents={['fit']}>
      {watch === null ? (
        <SheetNotice
          title="Add your watch first"
          body="Workouts start on your watch, and this page follows them live."
          action={<Button label="Add a watch" href={href.connect('watch')} />}
        />
      ) : (
        <SheetBody watch={watch} />
      )}
    </Sheet>
  );
}

export interface StartWorkout {
  readonly action: PrimaryActionProps | undefined;
  readonly sheet: ReactNode;
}

export function useStartWorkout(openOnArrival: boolean): StartWorkout {
  const watch = useMyWatch();
  const [open, setOpen] = useState(openOnArrival);
  const running = isRunning(useWatchWorkout(watch));
  return {
    action:
      watch === null
        ? undefined
        : {
            label: running ? 'Workout in progress' : 'Start workout',
            icon: running ? 'activity' : 'play',
            extended: true,
            onPress: (): void => {
              setOpen(true);
            },
          },
    sheet: open ? (
      <WorkoutSheet
        watch={watch}
        onClose={() => {
          setOpen(false);
        }}
      />
    ) : null,
  };
}
