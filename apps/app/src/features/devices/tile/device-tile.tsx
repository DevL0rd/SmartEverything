import { deviceCardOf } from '../../../plugins/device-contributions';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { anchorKey } from '../../../components/highlight-keys';
import { Interactive } from '../../../components/interactive';
import { StatusChip } from '../../../components/status-chip';
import { Text } from '../../../components/text';
import { useHighlightAnchor } from '../../../components/use-highlight-anchor';
import { href } from '../../../app-shell/hrefs';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { useDeviceValues, useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceScheduleChip } from '../../automations';
import { DeviceVisual } from '../../device-visuals';
import { useDeviceContextMenu } from '../controls/device-context-menu';
import { PowerToggle } from '../controls/power-toggle';
import { useDisplayName } from '../model/display-name';
import { deviceModelOf, powerStateOf, useDeviceModel } from '../model/device-model';
import { stateLine } from '../model/state-line';
import { renderFamilyFace } from '../../../app-shell/family-faces';
import { FAMILY_TILE_PARTS } from './family-tile-parts';

export interface DeviceTileProps {
  readonly device: Device;
  readonly showRoom?: boolean;
  readonly inset?: boolean;
}

const TILE_SURFACE: Readonly<Record<'card' | 'inset', string>> = {
  card: 'rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1',
  inset: 'flex-1 rounded-md bg-surface-2',
};

function TileText({
  device,
  name,
  showRoom,
}: {
  readonly device: Device;
  readonly name: string;
  readonly showRoom: boolean;
}): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const room = useRoomName(device.id);
  const on = powerStateOf(model, values) === 'on';
  return (
    <View className="gap-0.5">
      <Text variant="body-strong" numberOfLines={2}>
        {name}
      </Text>
      {showRoom && room !== null ? (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {room}
        </Text>
      ) : null}
      <Text variant="footnote" tone={on ? 'primary' : 'variant'} numberOfLines={1}>
        {stateLine(model, values)}
      </Text>
    </View>
  );
}

function TileBody({
  device,
  name,
  showRoom,
  offline,
}: {
  readonly device: Device;
  readonly name: string;
  readonly showRoom: boolean;
  readonly offline: boolean;
}): ReactNode {
  const card = deviceCardOf(device);
  if (card !== undefined) return card.render(device, 'tile', showRoom);
  const { family } = deviceModelOf(device);
  const registered = renderFamilyFace(family, device, 's');
  if (registered !== null) return registered;
  const Bar = FAMILY_TILE_PARTS[family]?.bar;
  return (
    <>
      <View className={cn('flex-row items-start', offline && 'opacity-60')}>
        <DeviceVisual device={device} size="tile" />
      </View>
      <TileText device={device} name={name} showRoom={showRoom} />
      {Bar === undefined ? null : <Bar device={device} />}
    </>
  );
}

function TileCorner({
  device,
  offline,
}: {
  readonly device: Device;
  readonly offline: boolean;
}): ReactNode {
  const Corner = FAMILY_TILE_PARTS[useDeviceModel(device).family]?.corner;
  return (
    <View className="absolute right-2 top-2 flex-row items-center" pointerEvents="box-none">
      <DeviceScheduleChip deviceId={device.id} compact />
      {offline || Corner === undefined ? null : <Corner device={device} />}
      {offline ? <StatusChip status="offline" /> : <PowerToggle device={device} />}
    </View>
  );
}

function DeviceTileBase({ device, showRoom = true, inset = false }: DeviceTileProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const name = useDisplayName(device.id);
  const model = useDeviceModel(device);
  const offline = !device.online && !model.sleepy;
  const menu = useDeviceContextMenu(device, { quickControls: true, label: name });
  const anchor = useHighlightAnchor(anchorKey.tile(device.id), name);
  return (
    <View {...anchor} className={inset ? 'relative flex-1' : 'relative'}>
      <Interactive
        href={href.device(device)}
        label={name}
        hint="Hold for more"
        onLongPress={menu.onLongPress}
        onContextMenu={menu.onContextMenu}
        className={cn(
          'justify-between gap-3 p-card-pad',
          TILE_SURFACE[inset ? 'inset' : 'card'],
          pointer ? 'min-h-30' : 'min-h-33',
        )}
        layerClassName={inset ? 'rounded-md' : 'rounded-lg'}
      >
        <TileBody device={device} name={name} showRoom={showRoom} offline={offline} />
      </Interactive>
      <TileCorner device={device} offline={offline} />
      {menu.host}
    </View>
  );
}

export const DeviceTile = memo(DeviceTileBase);
