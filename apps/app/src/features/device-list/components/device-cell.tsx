import { memo, type ReactNode } from 'react';
import { isCamera } from '@smarteverything/domain';
import {
  renderWidget,
  type WidgetDefinition,
  type WidgetFrameBox,
} from '../../../components/widget-board';
import type { Device } from '../../../store/state';
import { CAMERA_WIDGETS } from '../../cameras';
import { DeviceSpotlightWidget } from '../../devices';

const CAMERA: WidgetDefinition | undefined = CAMERA_WIDGETS.find(
  (definition) => definition.type === 'camera',
);

function Cell({
  device,
  frame,
}: {
  readonly device: Device;
  readonly frame: WidgetFrameBox;
}): ReactNode {
  if (isCamera(device) && CAMERA !== undefined) {
    return renderWidget(
      CAMERA,
      { size: 'M', options: { deviceId: device.id }, editing: false, frame },
      null,
    );
  }
  return <DeviceSpotlightWidget deviceId={device.id} size="M" editing={false} frame={frame} />;
}

export const DeviceCell = memo(Cell);
