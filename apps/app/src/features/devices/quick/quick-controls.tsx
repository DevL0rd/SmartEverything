import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { href } from '../../../app-shell/hrefs';
import { deviceCardOf } from '../../../plugins/device-contributions';
import { useDevice, useDeviceValues } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { closeQuickControls, useQuickControlsTarget } from '../../../store/ui-state';
import { DeviceVisual } from '../../device-visuals';
import { FAMILY_CONTROLS } from '../controls/family-controls';
import { PowerToggle } from '../controls/power-toggle';
import { PrimaryControls } from '../controls/primary-controls';
import { OfflineBanner } from '../detail/offline-banner';
import { useDisplayName } from '../model/display-name';
import { useDeviceModel } from '../model/device-model';
import { stateLine } from '../model/state-line';

function Header({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const name = useDisplayName(device.id);
  return (
    <View className="flex-row items-center gap-3">
      <DeviceVisual device={device} size="card" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="title-3" numberOfLines={2}>
          {name}
        </Text>
        {deviceCardOf(device)?.subtitle?.(device) ?? (
          <Text variant="callout" tone="variant" numberOfLines={1}>
            {stateLine(model, values)}
          </Text>
        )}
      </View>
      <PowerToggle device={device} />
    </View>
  );
}

function Body({ device }: { readonly device: Device }): ReactNode {
  const router = useRouter();
  const model = useDeviceModel(device);
  const Quick = FAMILY_CONTROLS[model.family]?.quick;
  return (
    <View className="gap-5 p-1">
      <Header device={device} />
      {model.sleepy ? null : <OfflineBanner device={device} />}
      {deviceCardOf(device)?.quick?.(device)}
      {Quick === undefined ? <PrimaryControls device={device} /> : <Quick device={device} />}
      <Button
        label="Open device"
        icon="chevronRight"
        variant="tonal"
        onPress={() => {
          closeQuickControls();
          router.push(href.device(device));
        }}
      />
    </View>
  );
}

export function QuickControlsHost(): ReactNode {
  const target = useQuickControlsTarget();
  const device = useDevice(target?.deviceId ?? '');
  const name = useDisplayName(target?.deviceId ?? '');
  if (target === null || device === null) {
    return null;
  }
  return (
    <Sheet
      open
      onClose={closeQuickControls}
      label={`${name} quick controls`}
      detents={['half', 'full']}
      kind={target.anchor === null ? 'dialog' : 'popover'}
      anchor={target.anchor}
    >
      <View className={target.anchor === null ? '' : 'p-3'}>
        <Body device={device} />
      </View>
    </Sheet>
  );
}
