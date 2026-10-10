import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { CapabilityRole } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Interactive } from '../../../components/interactive';
import { useContextMenu } from '../../../components/menu';
import type { WidgetSize } from '../../../components/widget-board';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useVisualPx, VisualVisibility } from '../../device-visuals';
import { DeviceScheduleChip } from '../../automations';
import { useDeviceMenu } from '../controls/device-menu';
import { FACES, layoutOf, type Box, type FaceProps } from './card-faces';

export interface DeviceSpotlightCardProps {
  readonly device: Device;
  readonly size: WidgetSize;
  readonly editing: boolean;
  readonly hidden?: ReadonlySet<CapabilityRole>;
  readonly banner?: boolean;
}

const NOTHING_HIDDEN: ReadonlySet<CapabilityRole> = new Set();

function Body({
  box,
  banner,
  ...face
}: Omit<FaceProps, 'box'> & { readonly box: Box | null; readonly banner: boolean }): ReactNode {
  const hero = useVisualPx('hero');
  if (box === null) {
    return null;
  }
  const Face = FACES[banner && face.size !== 'S' ? 'banner' : layoutOf(face.size, box, hero)];
  return <Face {...face} box={box} />;
}

function DeviceSpotlightCard(props: DeviceSpotlightCardProps): ReactNode {
  const { device, size, editing, hidden = NOTHING_HIDDEN, banner = false } = props;
  const [box, setBox] = useState<Box | null>(null);
  const router = useRouter();
  const menu = useContextMenu(useDeviceMenu(device, { quickControls: size === 'S' }), device.label);
  const go = (): void => {
    router.push(href.device(device));
  };
  return (
    <View className="h-full overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
      <Interactive
        label={device.label}
        hint="Hold for more"
        disabled={editing}
        href={href.device(device)}
        onLongPress={menu.onLongPress}
        onContextMenu={menu.onContextMenu}
        className="absolute inset-0"
        layerClassName="rounded-lg"
      >
        <View />
      </Interactive>
      <View
        className="flex-1 p-card-pad"
        pointerEvents={editing ? 'none' : 'box-none'}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setBox({ width: Math.round(width), height: Math.round(height) });
        }}
      >
        <VisualVisibility visible={!editing}>
          <Body box={box} banner={banner} device={device} hidden={hidden} size={size} open={go} />
        </VisualVisibility>
      </View>
      {editing ? null : (
        <View className="absolute bottom-2 right-2" pointerEvents="box-none">
          <DeviceScheduleChip deviceId={device.id} compact />
        </View>
      )}
      {menu.host}
    </View>
  );
}

export function DeviceSpotlightWidget({
  deviceId,
  ...card
}: Omit<DeviceSpotlightCardProps, 'device'> & { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return device === null ? null : <DeviceSpotlightCard device={device} {...card} />;
}
