import { memo, type ReactNode } from 'react';
import { isCamera } from '@smarteverything/domain';
import type { WidgetDefinition } from '../../../components/widget-board';
import type { Device } from '../../../store/state';
import { CAMERA_WIDGETS } from '../../cameras';
import { DeviceSpotlightWidget } from '../../devices';

const CAMERA: WidgetDefinition | undefined = CAMERA_WIDGETS.find(
  (definition) => definition.type === 'camera',
);

function Cell({ device, wide }: { readonly device: Device; readonly wide: boolean }): ReactNode {
  const size = wide ? 'M' : 'S';
  if (isCamera(device) && CAMERA !== undefined) {
    return CAMERA.render({ size, options: { deviceId: device.id }, editing: false });
  }
  return <DeviceSpotlightWidget deviceId={device.id} size={size} editing={false} banner />;
}

export const DeviceCell = memo(Cell);
