import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DEVICE_FAMILIES, humanizeEnum, type DeviceTarget } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';

interface TargetPickerProps {
  readonly target: DeviceTarget;
  readonly catalog: Catalog;
  readonly onChange: (target: DeviceTarget) => void;
}
function ExplicitDevices({ target, catalog, onChange }: TargetPickerProps): ReactNode {
  if (target.kind !== 'devices') return null;
  const devices = catalog.allDevices;
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        Choose up to 100 devices.
      </Text>
      {devices.map((device) => (
        <Checkbox
          key={device.id}
          label={device.label}
          checked={target.deviceIds.includes(device.id)}
          disabled={!target.deviceIds.includes(device.id) && target.deviceIds.length >= 100}
          onChange={(checked) => {
            onChange({
              ...target,
              deviceIds: checked
                ? [...target.deviceIds, device.id]
                : target.deviceIds.filter((id) => id !== device.id),
            });
          }}
        />
      ))}
      {target.deviceIds
        .filter((id) => !devices.some((device) => device.id === id))
        .map((id) => (
          <Checkbox
            key={id}
            label="Removed device"
            checked
            onChange={() => {
              onChange({ ...target, deviceIds: target.deviceIds.filter((entry) => entry !== id) });
            }}
          />
        ))}
    </View>
  );
}
function RoomFamilies({ target, onChange }: TargetPickerProps): ReactNode {
  if (target.kind !== 'room') return null;
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        With no family filter, include every device family.
      </Text>
      {(target.families ?? []).map((family) => (
        <Button
          key={family}
          label={`Remove ${humanizeEnum(family)} filter`}
          variant="text"
          onPress={() => {
            const families = target.families?.filter((entry) => entry !== family);
            onChange(
              families === undefined || families.length === 0
                ? { kind: 'room', roomId: target.roomId }
                : { ...target, families },
            );
          }}
        />
      ))}
      <Select
        label="Add a device family filter"
        value={null}
        searchable
        options={DEVICE_FAMILIES.filter((family) => target.families?.includes(family) !== true).map(
          (value) => ({ value, label: humanizeEnum(value) }),
        )}
        onChange={(family) => {
          onChange({ ...target, families: [...(target.families ?? []), family] });
        }}
      />
    </View>
  );
}
export function ProgramTargetPicker(props: TargetPickerProps): ReactNode {
  const { target, catalog, onChange } = props;
  const value =
    target.kind === 'devices'
      ? 'devices'
      : `${target.kind}:${target.kind === 'room' ? target.roomId : target.groupId}`;
  return (
    <>
      <Select
        label="Target"
        searchable
        value={value}
        options={[
          { value: 'devices', label: 'Select devices' },
          ...(catalog.groups ?? []).map((row) => ({ value: `group:${row.id}`, label: row.name })),
          ...(catalog.rooms ?? []).map((row) => ({
            value: `room:${row.id}`,
            label: `${row.name} · room`,
          })),
        ]}
        onChange={(key) => {
          if (key === 'devices') {
            onChange({ kind: 'devices', deviceIds: [] });
            return;
          }
          const group = catalog.groups?.find((row) => `group:${row.id}` === key);
          const room = catalog.rooms?.find((row) => `room:${row.id}` === key);
          if (group !== undefined) onChange({ kind: 'group', groupId: group.id });
          else if (room !== undefined) onChange({ kind: 'room', roomId: room.id });
        }}
      />
      <ExplicitDevices {...props} />
      <RoomFamilies {...props} />
    </>
  );
}
