import type { ReactNode } from 'react';
import type { ScheduleRow } from '@smarteverything/domain';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TimeField, type TimeOfDay } from '../../../components/time-field';
import { notify } from '../../../components/toast-store';
import { clock } from '../../../format/time';
import { useMutationState } from '../../../store/mutation';
import { rowsOf } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { cancelScheduled, saveScheduled } from './actions';
import { SLEEP_MINUTES, sleepSave, sleepTimerOf } from './sleep-save';
import { useHomeZone } from './use-scheduled';
import { minutesLabel, whenLabel, type When } from './when';

const WALL_ZONE = 'UTC';

function wallClock(time: TimeOfDay): string {
  return clock(Date.UTC(1970, 0, 1, time.hour, time.minute), WALL_ZONE);
}

function localWhen(when: When): string {
  return when.kind === 'in' ? whenLabel(when) : `at ${wallClock(when.time)}`;
}

const EVENING: TimeOfDay = { hour: 23, minute: 0 };

function useSleepTimer(deviceId: string): ScheduleRow | null {
  return useStoreSelector(
    (state) => sleepTimerOf(rowsOf(state.tables.scheduled_actions), deviceId),
    Object.is,
    [deviceId],
  );
}

function ActiveTimer({ deviceId }: { readonly deviceId: string }): ReactNode {
  const row = useSleepTimer(deviceId);
  const zone = useHomeZone();
  const at = row?.next_at;
  if (row === null || at === null || at === undefined) {
    return null;
  }
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-md bg-primary-container px-4 py-3">
      <Text variant="body-strong" tone="primary" className="tabular">
        {`Turns off at ${clock(at, zone)}`}
      </Text>
      <Button
        label="Cancel"
        variant="text"
        onPress={(): void => {
          cancelScheduled(row);
        }}
      />
    </View>
  );
}

function TimeChoice({
  busy,
  onSet,
}: {
  readonly busy: boolean;
  readonly onSet: (when: When) => void;
}): ReactNode {
  const [time, setTime] = useState<TimeOfDay>(EVENING);
  return (
    <View className="gap-3">
      <TimeField label="Turn off at" value={time} onChange={setTime} />
      <Button
        label={`Set for ${wallClock(time)}`}
        loading={busy}
        onPress={(): void => {
          onSet({ kind: 'at', time });
        }}
      />
    </View>
  );
}

function useSleepSet(
  deviceId: string,
  name: string,
  onClose: () => void,
): { readonly busy: boolean; readonly set: (when: When) => void } {
  const active = useSleepTimer(deviceId);
  const mutation = useMutationState();
  return {
    busy: mutation.busy,
    set: (when): void => {
      mutation.run(() => saveScheduled(sleepSave(deviceId, when, active?.id ?? null)), {
        failure: `${name} wasn’t scheduled`,
        onDone: () => {
          notify({ message: `${name} turns off ${localWhen(when)}` });
          onClose();
        },
      });
    },
  };
}

export function SleepTimerSheet({
  deviceId,
  name,
  open,
  onClose,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const { busy, set } = useSleepSet(deviceId, name, onClose);
  const [choosingTime, setChoosingTime] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Sleep timer" detents={['fit']}>
      <View className="gap-4">
        <ActiveTimer deviceId={deviceId} />
        <Text variant="footnote" tone="variant">
          The TV turns itself off. Nothing starts until you pick a time.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {SLEEP_MINUTES.map((minutes) => (
            <Button
              key={minutes}
              label={minutesLabel(minutes)}
              variant="tonal"
              disabled={busy}
              onPress={(): void => {
                set({ kind: 'in', minutes });
              }}
            />
          ))}
          <Button
            label="At a time"
            variant={choosingTime ? 'filled' : 'tonal'}
            onPress={(): void => {
              setChoosingTime(!choosingTime);
            }}
          />
        </View>
        {choosingTime ? <TimeChoice busy={busy} onSet={set} /> : null}
      </View>
    </Sheet>
  );
}
