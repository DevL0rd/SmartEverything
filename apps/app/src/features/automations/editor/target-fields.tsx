import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DeviceCapability } from '@smarteverything/domain';
import { Select, type SelectOption } from '../../../components/select';
import { Text } from '../../../components/text';
import type { DeviceLike } from '../model/capability-choices';
import { capabilityLabel } from '../model/present';

export type Usable = (device: DeviceLike) => readonly DeviceCapability[];

export interface Target {
  readonly device: DeviceLike;
  readonly capability: DeviceCapability;
}

const SEARCHABLE_FROM = 7;

export function targetOf(
  devices: readonly DeviceLike[],
  deviceId: string,
  key: string,
): Target | null {
  const device = devices.find((candidate) => candidate.id === deviceId);
  const capability = device?.capabilities.find((candidate) => candidate.key === key);
  return device === undefined || capability === undefined ? null : { device, capability };
}

export function deviceOptions(devices: readonly DeviceLike[]): SelectOption<string>[] {
  return devices.map((device) => ({ value: device.id, label: device.label }));
}

function capabilityOptions(device: DeviceLike, usable: Usable): SelectOption<string>[] {
  return usable(device).map((capability) => ({
    value: capability.key,
    label: capabilityLabel(device, capability),
  }));
}

export function TargetFields({
  devices,
  usable,
  deviceId,
  capability,
  onTarget,
}: {
  readonly devices: readonly DeviceLike[];
  readonly usable: Usable;
  readonly deviceId: string;
  readonly capability: string;
  readonly onTarget: (device: DeviceLike, capability: DeviceCapability) => void;
}): ReactNode {
  const eligible = devices.filter((device) => usable(device).length > 0);
  const device = eligible.find((candidate) => candidate.id === deviceId);
  const offered = device === undefined ? [] : capabilityOptions(device, usable);
  return (
    <View className="gap-3">
      <Select
        label="Device"
        placeholder="Pick a device"
        value={device === undefined ? null : device.id}
        options={deviceOptions(eligible)}
        searchable={eligible.length >= SEARCHABLE_FROM}
        onChange={(id) => {
          const picked = eligible.find((candidate) => candidate.id === id);
          const first = picked === undefined ? undefined : usable(picked)[0];
          if (picked !== undefined && first !== undefined) {
            onTarget(picked, first);
          }
        }}
      />
      {device === undefined ? null : (
        <Select
          label="Setting"
          placeholder="Pick a setting"
          value={offered.some((option) => option.value === capability) ? capability : null}
          options={offered}
          searchable={offered.length >= SEARCHABLE_FROM}
          onChange={(key) => {
            const picked = usable(device).find((candidate) => candidate.key === key);
            if (picked !== undefined) {
              onTarget(device, picked);
            }
          }}
        />
      )}
    </View>
  );
}

export function MissingTarget(): ReactNode {
  return (
    <Text variant="callout" tone="critical">
      This device or setting is gone. Pick another or remove this step.
    </Text>
  );
}
