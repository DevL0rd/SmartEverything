import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
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

function QuickScheduleSheet({ device }: { readonly device: Device }): ReactNode {
  const router = useRouter();
  const on = useDeviceValue(device.id, 'power')?.value === true;
  const verb = on ? 'Turn off' : 'Turn on';
  const [when, setWhen] = useState<When>(DEFAULT_WHEN);
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
        onDone: (row) => {
          if (row !== null) {
            notify({ message: `${device.label} turns ${on ? 'off' : 'on'} ${whenLabel(when)}` });
            close();
          }
        },
      },
    );
  };
  const footer = (
    <View className="flex-row flex-wrap justify-end gap-3">
      <Button
        label="More options"
        variant="text"
        onPress={() => {
          close();
          router.push(href.scheduledNew(device.id));
        }}
      />
      <Button label={`${verb} ${whenLabel(when)}`} loading={mutation.busy} onPress={save} />
    </View>
  );
  return (
    <Sheet open onClose={close} title={`${verb} ${device.label}`} detents={['fit']} footer={footer}>
      <WhenPicker value={when} onChange={setWhen} />
    </Sheet>
  );
}

function OpenSheet({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return device === null ? null : <QuickScheduleSheet key={deviceId} device={device} />;
}

export function ScheduleSheetHost(): ReactNode {
  const deviceId = useValue(target);
  return deviceId === null ? null : <OpenSheet deviceId={deviceId} />;
}
