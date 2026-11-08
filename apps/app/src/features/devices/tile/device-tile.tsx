import { deviceCardOf } from '../../../plugins/device-contributions';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { anchorKey } from '../../../components/highlight-keys';
import { Interactive } from '../../../components/interactive';
import { StatusChip } from '../../../components/status-chip';
import { Text } from '../../../components/text';
import { useHighlightAnchor } from '../../../components/use-highlight-anchor';
import { ActionBand } from '../../../components/widget-board/action-band';
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
import { TILE_MIN_HEIGHT } from './tile-grid';

export interface DeviceTileProps {
  readonly device: Device;
  readonly showRoom?: boolean;
  readonly inset?: boolean;
}

const TILE_SURFACE: Readonly<Record<'card' | 'inset', string>> = {
  card: 'rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1',
  inset: 'flex-1 rounded-md bg-surface-2',
};

const TILE_BOX = {
  touch: { minHeight: TILE_MIN_HEIGHT.touch },
  pointer: { minHeight: TILE_MIN_HEIGHT.pointer },
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
    <View className="gap-0.5" pointerEvents="none">
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

function TileBand({
  device,
  offline,
}: {
  readonly device: Device;
  readonly offline: boolean;
}): ReactNode {
  const Corner = FAMILY_TILE_PARTS[useDeviceModel(device).family]?.corner;
  return (
    <ActionBand>
      <DeviceScheduleChip deviceId={device.id} compact />
      {offline || Corner === undefined ? null : <Corner device={device} />}
      {offline ? <StatusChip status="offline" /> : <PowerToggle device={device} />}
    </ActionBand>
  );
}

function ownBodyOf(device: Device, showRoom: boolean): { readonly body: ReactNode } | null {
  const card = deviceCardOf(device);
  if (card !== undefined) return { body: card.render(device, 'tile', showRoom) };
  const registered = renderFamilyFace(deviceModelOf(device).family, device, 's');
  return registered === null ? null : { body: registered };
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
  const own = ownBodyOf(device, showRoom);
  const band = <TileBand device={device} offline={offline} />;
  if (own !== null) {
    return (
      <>
        <View className="flex-1" pointerEvents="box-none">
          {own.body}
        </View>
        {band}
      </>
    );
  }
  const Bar = FAMILY_TILE_PARTS[deviceModelOf(device).family]?.bar;
  return (
    <View className="flex-1 flex-row gap-3" pointerEvents="box-none">
      <View className={cn('shrink-0 self-start', offline && 'opacity-60')} pointerEvents="none">
        <DeviceVisual device={device} size="tile" />
      </View>
      <View className="min-w-0 flex-1 gap-2" pointerEvents="box-none">
        <TileText device={device} name={name} showRoom={showRoom} />
        {Bar === undefined ? null : <Bar device={device} />}
        {band}
      </View>
    </View>
  );
}

function DeviceTileBase({ device, showRoom = true, inset = false }: DeviceTileProps): ReactNode {
  const box = TILE_BOX[useIdiom()];
  const name = useDisplayName(device.id);
  const model = useDeviceModel(device);
  const offline = !device.online && !model.sleepy;
  const menu = useDeviceContextMenu(device, { quickControls: true, label: name });
  const anchor = useHighlightAnchor(anchorKey.tile(device.id), name);
  const rounded = inset ? 'rounded-md' : 'rounded-lg';
  return (
    <View
      {...anchor}
      className={cn('relative', TILE_SURFACE[inset ? 'inset' : 'card'])}
      style={box}
    >
      <Interactive
        href={href.device(device)}
        label={name}
        hint="Hold for more"
        onLongPress={menu.onLongPress}
        onContextMenu={menu.onContextMenu}
        className={cn('absolute inset-0', rounded)}
        layerClassName={rounded}
      >
        {null}
      </Interactive>
      <View className="flex-1 gap-3 p-card-pad" pointerEvents="box-none">
        <TileBody device={device} name={name} showRoom={showRoom} offline={offline} />
      </View>
      {menu.host}
    </View>
  );
}

export const DeviceTile = memo(DeviceTileBase);
