import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Sheet, type SheetProps } from '../../../components/sheet';
import { notify } from '../../../components/toast-store';
import { ValueStore, useValue } from '../../../design/external-store';
import { useMutationState } from '../../../store/mutation';
import { useDevice, useDeviceValue } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { saveScheduled } from './actions';
import { powerActions, stepsOf } from './steps';
import { DEFAULT_WHEN, timingOf, whenLabel, type When } from './when';
import { WhenPicker } from './when-picker';

const target = new ValueStore<string | null>(null);

export function openScheduleSheet(deviceId: string): void {
  target.set(deviceId);
}

function close(): void {
  target.set(null);
}

interface ScheduleNavigation {
  readonly onClose: () => void;
  readonly onExit?: () => void;
  readonly subpage?: SheetProps['subpage'];
}

function usePowerSchedule(
  device: Device,
  when: When,
  onExit: () => void,
): {
  readonly verb: string;
  readonly busy: boolean;
  readonly save: () => void;
} {
  const on = useDeviceValue(device.id, 'power')?.value === true;
  const mutation = useMutationState();
  const save = (): void => {
    mutation.run(
      () =>
        saveScheduled({
          kind: 'create',
          body: {
            label: null,
            timing: timingOf(when),
            steps: stepsOf(powerActions(device.id, !on)),
          },
        }),
      {
        failure: `${device.label} wasn’t scheduled`,
        onDone: () => {
          notify({ message: `${device.label} turns ${on ? 'off' : 'on'} ${whenLabel(when)}` });
          onExit();
        },
      },
    );
  };
  return { verb: on ? 'Turn off' : 'Turn on', busy: mutation.busy, save };
}

function QuickScheduleSheet({
  device,
  onClose,
  onExit = onClose,
  subpage,
}: ScheduleNavigation & { readonly device: Device }): ReactNode {
  const router = useRouter();
  const [when, setWhen] = useState<When>(DEFAULT_WHEN);
  const { verb, busy, save } = usePowerSchedule(device, when, onExit);
  const footer = (
    <View className="flex-row flex-wrap justify-end gap-3">
      <Button
        label="More options"
        variant="text"
        onPress={() => {
          onExit();
          router.push(href.scheduledNew(device.id));
        }}
      />
      <Button label={`${verb} ${whenLabel(when)}`} loading={busy} onPress={save} />
    </View>
  );
  return (
    <Sheet
      subpage={subpage}
      open
      onClose={onClose}
      title={`${verb} ${device.label}`}
      detents={['fit']}
      footer={footer}
    >
      <WhenPicker value={when} onChange={setWhen} />
    </Sheet>
  );
}

export function QuickSchedulePanel({
  deviceId,
  ...navigation
}: ScheduleNavigation & { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return device === null ? null : (
    <QuickScheduleSheet key={deviceId} device={device} {...navigation} />
  );
}

export function ScheduleSheetHost(): ReactNode {
  const deviceId = useValue(target);
  return deviceId === null ? null : <QuickSchedulePanel deviceId={deviceId} onClose={close} />;
}
