import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CapabilityRole } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { ControlBlock } from '../controls/control-block';
import { offlineReason, poweredOffReason } from '../controls/guard';
import { useDeviceModel } from '../model/device-model';
import { useDisplayName } from '../model/display-name';
import { LightSheetButton } from './light-sheet';
import { StrengthControl } from './strength-control';
import { useDiffuserRead } from './use-diffuser';

const STRENGTH_ROLES: ReadonlySet<CapabilityRole> = new Set(['spray_interval', 'spray_duration']);

export const DIFFUSER_MANAGED: ReadonlySet<string> = new Set(['raw:2.3', 'raw:2.4']);

function ColourRow({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="flex-row items-center justify-between">
      <Text variant="callout">Colour</Text>
      <LightSheetButton device={device} />
    </View>
  );
}

export function DiffuserControls({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const name = useDisplayName(device.id);
  const { power } = useDiffuserRead(device);
  const reason = !device.online
    ? offlineReason(name)
    : power === 'off'
      ? poweredOffReason(name)
      : null;
  return (
    <View className="gap-5">
      <StrengthControl device={device} />
      {model.curated
        .filter((presented) => presented.role === null || !STRENGTH_ROLES.has(presented.role))
        .map((presented) =>
          presented.role === 'color' ? (
            <ColourRow key={presented.key} device={device} />
          ) : (
            <ControlBlock
              key={presented.key}
              device={device}
              presented={presented}
              reason={reason}
            />
          ),
        )}
    </View>
  );
}
