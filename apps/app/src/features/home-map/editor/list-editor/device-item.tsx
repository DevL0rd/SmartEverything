import type { ReactNode } from 'react';
import { View } from 'react-native';
import { homeMapSnapRotation, type HomeMapPlacement } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Segmented } from '../../../../components/segmented';
import { Text } from '../../../../components/text';
import type { Device } from '../../../../store/state';
import { deviceIcon } from '../../../device-visuals';
import { remountedPlacement, placementOps } from '../tools/devices-model';
import { CmField, ListItem, PointFields } from './list-parts';
import { DegreeField, RoomChoice, TURN_RANGE } from './object-item';
import {
  MOUNT_LABELS,
  manualPlaceOp,
  MOUNT_OPTIONS,
  NOT_ON_MAP_TEXT,
  placementOp,
  roomIdAt,
  roomNameAt,
  type ItemsContext,
  type PlacedDevice,
  type UnplacedDevice,
} from './objects-devices-model';

const TILT_RANGE = [-90, 90] as const;

export function DeviceThumb({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="h-12 w-24 shrink-0 items-center justify-center rounded-sm bg-surface-2">
      <Icon name={deviceIcon(device)} size={24} tone="primary" />
    </View>
  );
}

function PlacementFields({
  context,
  placement,
  device,
}: {
  readonly context: ItemsContext;
  readonly device: Device;
  readonly placement: HomeMapPlacement;
}): ReactNode {
  const fixed = context.readOnly;
  const patch = (next: Partial<HomeMapPlacement>): void => {
    context.apply([placementOp(context.floor.id, placement.deviceId, next)]);
  };
  return (
    <>
      <RoomChoice
        context={context}
        current={roomIdAt(context.floor, placement.at)}
        disabled={fixed}
        onChoose={(room): void => {
          patch({ at: room.labelAt });
        }}
      />
      <PointFields
        label="Position"
        point={placement.at}
        disabled={fixed}
        onChange={(at): void => {
          patch({ at: { x: at.x, y: at.y } });
        }}
      />
      <Segmented
        label="Mount"
        options={MOUNT_OPTIONS}
        value={placement.mount}
        disabled={fixed}
        onChange={(mount): void => {
          const next = remountedPlacement(context.floor, device, placement, mount);
          context.apply(placementOps(placement, next));
        }}
      />
      <MountFields placement={placement} disabled={fixed} patch={patch} />
    </>
  );
}

function MountFields({
  placement,
  disabled,
  patch,
}: {
  readonly placement: HomeMapPlacement;
  readonly disabled: boolean;
  readonly patch: (next: Partial<HomeMapPlacement>) => void;
}): ReactNode {
  return (
    <>
      <CmField
        label="Height"
        value={placement.height}
        min={0}
        disabled={disabled}
        onChange={(height): void => {
          patch({ height });
        }}
      />
      <DegreeField
        label="Rotation"
        value={placement.rotation}
        range={TURN_RANGE}
        disabled={disabled}
        onChange={(rotation): void => {
          patch({ rotation: homeMapSnapRotation(rotation, null) });
        }}
      />
      <DegreeField
        label="Tilt"
        value={placement.tilt}
        range={TILT_RANGE}
        disabled={disabled}
        onChange={(tilt): void => {
          patch({ tilt });
        }}
      />
    </>
  );
}

export function placedSubtitle(context: ItemsContext, placement: HomeMapPlacement): string {
  const how = placement.auto ? 'placed automatically' : 'placed by you';
  return [roomNameAt(context, placement.at), MOUNT_LABELS[placement.mount], how].join(' · ');
}

export function PlacedDeviceItem({
  context,
  entry,
  open,
  onToggle,
}: {
  readonly context: ItemsContext;
  readonly entry: PlacedDevice;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  const { device, placement } = entry;
  return (
    <ListItem
      title={device.label}
      subtitle={placedSubtitle(context, placement)}
      thumb={<DeviceThumb device={device} />}
      open={open}
      onToggle={onToggle}
    >
      <PlacementFields context={context} placement={placement} device={device} />
      <Button
        label="Take it off the map"
        icon="trash"
        variant="destructive"
        disabled={context.readOnly}
        onPress={(): void => {
          context.apply([
            { op: 'remove', kind: 'placement', floorId: context.floor.id, id: device.id },
          ]);
        }}
      />
    </ListItem>
  );
}

export function UnplacedDeviceRow({
  context,
  entry,
}: {
  readonly context: ItemsContext;
  readonly entry: UnplacedDevice;
}): ReactNode {
  const { device, onMap } = entry;
  return (
    <View className="min-h-touch-min flex-row flex-wrap items-center gap-3 rounded-md bg-surface-1 p-2">
      <DeviceThumb device={device} />
      <View className="min-w-40 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {device.label}
        </Text>
        <Text variant="caption" tone="variant">
          {onMap ? 'Not on the map yet' : NOT_ON_MAP_TEXT}
        </Text>
      </View>
      <Button
        label="Place automatically"
        icon="sparkles"
        variant="tonal"
        disabled={context.readOnly || !onMap}
        onPress={(): void => {
          context.place([device.id]);
        }}
      />
      <View className="w-full">
        <RoomChoice
          context={context}
          current={null}
          label="Place in a room"
          emptyText="Puts it at the room's centre; move it after."
          disabled={context.readOnly}
          onChoose={(room): void => {
            context.apply([manualPlaceOp(context.floor.id, device.id, room.labelAt)]);
          }}
        />
      </View>
    </View>
  );
}
