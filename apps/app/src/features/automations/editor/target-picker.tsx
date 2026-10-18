import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DEVICE_FAMILIES, humanizeEnum, type TargetV2 } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { deviceOptions } from './target-fields';
import {
  availableKinds,
  controllable,
  KIND_LABELS,
  kindOf,
  roomLightEntries,
  roomLightsChoice,
  targetFor,
} from './target-kind';

const SEARCHABLE_FROM = 7;

interface PickerProps {
  readonly catalog: Catalog;
  readonly target: TargetV2;
  readonly onChange: (target: TargetV2) => void;
}

function DeviceChecklist({
  catalog,
  devices,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly devices: readonly string[];
  readonly onChange: (target: TargetV2) => void;
}): ReactNode {
  const known = catalog.allDevices;
  return (
    <View className="gap-2">
      {known.map((device) => (
        <Checkbox
          key={device.id}
          label={device.label}
          checked={devices.includes(device.id)}
          onChange={(checked) => {
            onChange({
              devices: checked ? [...devices, device.id] : devices.filter((id) => id !== device.id),
            });
          }}
        />
      ))}
      {devices
        .filter((id) => !known.some((device) => device.id === id))
        .map((id) => (
          <Checkbox
            key={id}
            label="Removed device"
            checked
            onChange={() => {
              onChange({ devices: devices.filter((entry) => entry !== id) });
            }}
          />
        ))}
      {devices.length === 0 ? (
        <Text variant="callout" tone="critical">
          Pick at least one device.
        </Text>
      ) : null}
    </View>
  );
}

function RoomFields({
  catalog,
  target,
  onChange,
}: PickerProps & { readonly target: Extract<TargetV2, { room: string }> }): ReactNode {
  const families = target.families ?? [];
  return (
    <View className="gap-3">
      <Select
        label="Room"
        searchable
        value={target.room}
        options={catalog.rooms.map((row) => ({ value: row.id, label: row.name }))}
        onChange={(room) => {
          onChange({ ...target, room });
        }}
      />
      <Text variant="footnote" tone="variant">
        With no family filter, every device in the room is included.
      </Text>
      {families.map((family) => (
        <Button
          key={family}
          label={`Remove ${humanizeEnum(family)} filter`}
          variant="text"
          onPress={() => {
            const rest = families.filter((entry) => entry !== family);
            onChange(rest.length === 0 ? { room: target.room } : { ...target, families: rest });
          }}
        />
      ))}
      <Select
        label="Only these kinds of device"
        value={null}
        searchable
        options={DEVICE_FAMILIES.filter((family) => !families.includes(family)).map((value) => ({
          value,
          label: humanizeEnum(value),
        }))}
        onChange={(family) => {
          onChange({ ...target, families: [...families, family] });
        }}
      />
    </View>
  );
}

function RoomLightsFields({
  catalog,
  target,
  onChange,
}: PickerProps & { readonly target: Extract<TargetV2, { room: string }> }): ReactNode {
  return (
    <Select
      label="Lights of"
      searchable
      placeholder="Pick a room"
      value={roomLightsChoice(catalog, target.room)}
      options={roomLightEntries(catalog).flatMap((entry) =>
        entry.target.kind === 'room' ? [{ value: entry.target.roomId, label: entry.name }] : [],
      )}
      onChange={(room) => {
        onChange({ room, families: ['light'] });
      }}
    />
  );
}

function TargetDetail({ catalog, target, onChange }: PickerProps): ReactNode {
  if ('device' in target)
    return (
      <Select
        label="Device"
        placeholder="Pick a device"
        searchable={controllable(catalog).length >= SEARCHABLE_FROM}
        value={catalog.devices.some((device) => device.id === target.device) ? target.device : null}
        options={deviceOptions(controllable(catalog))}
        onChange={(device) => {
          onChange({ device });
        }}
      />
    );
  if ('devices' in target)
    return <DeviceChecklist catalog={catalog} devices={target.devices} onChange={onChange} />;
  if ('group' in target)
    return (
      <View className="gap-2">
        <Select
          label="Group"
          searchable
          value={catalog.groups.some((row) => row.id === target.group) ? target.group : null}
          placeholder="Pick a group"
          options={catalog.groups.map((row) => ({ value: row.id, label: row.name }))}
          onChange={(group) => {
            onChange({ group });
          }}
        />
        <Button label="New group…" variant="text" icon="plus" href={href.newGroup()} />
      </View>
    );
  return kindOf(target) === 'room-lights' ? (
    <RoomLightsFields catalog={catalog} target={target} onChange={onChange} />
  ) : (
    <RoomFields catalog={catalog} target={target} onChange={onChange} />
  );
}

export function TargetPicker(props: PickerProps): ReactNode {
  const { catalog, target, onChange } = props;
  const kind = kindOf(target);
  return (
    <View className="gap-3">
      <Select
        label="Control"
        value={kind}
        options={availableKinds(catalog, kind).map((value) => ({
          value,
          label: KIND_LABELS[value],
        }))}
        onChange={(next) => {
          const made = targetFor(next, catalog, target);
          if (made !== null) onChange(made);
        }}
      />
      <TargetDetail {...props} />
    </View>
  );
}
