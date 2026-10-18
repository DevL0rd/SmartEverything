import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { MICROWAVE_KEYS, type DeviceLogEntry } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { useControl } from '../../../store/control';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { CycleRows } from './cycle-rows';
import { lampState, lampTarget } from './lamp-model';
import { PANEL_CYCLES } from './cycles';

function LampSwitch({ device }: { readonly device: Device }): ReactNode {
  const lamp = useDeviceDerived(device.id, lampState, []);
  const control = useControl(device.id, MICROWAVE_KEYS.lamp);
  if (lamp.onLevel === null) {
    return null;
  }
  return (
    <View className="flex-row items-center gap-2">
      <Icon name="lamp" size={20} tone="variant" />
      <Text variant="callout">Lamp</Text>
      <Switch
        label="Lamp"
        value={lamp.on}
        disabled={!device.online || control.pending}
        onChange={(turnOn) => {
          const target = lampTarget(lamp, turnOn);
          if (target !== null) {
            background(control.set(target), 'control.set_failed');
          }
        }}
      />
    </View>
  );
}

function KidsLock({ deviceId }: { readonly deviceId: string }): ReactNode {
  const locked = useDeviceDerived(
    deviceId,
    (values) => values[MICROWAVE_KEYS.lock]?.value === 'locked',
    [],
  );
  return (
    <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1.5">
      <Icon name="lock" size={20} tone={locked ? 'primary' : 'variant'} />
      <Text variant="callout" tone="variant" numberOfLines={1}>
        {locked ? 'Kids lock on' : 'Kids lock off'}
      </Text>
    </View>
  );
}

export function PanelExtras({
  device,
  cycles,
}: {
  readonly device: Device;
  readonly cycles: readonly DeviceLogEntry[];
}): ReactNode {
  return (
    <View className="gap-1" pointerEvents="box-none">
      <View className="flex-row items-center gap-3" pointerEvents="box-none">
        <LampSwitch device={device} />
        <KidsLock deviceId={device.id} />
      </View>
      {cycles.length === 0 ? null : (
        <CycleRows cycles={cycles.slice(0, PANEL_CYCLES)} label="Recent cooking" compact />
      )}
    </View>
  );
}
