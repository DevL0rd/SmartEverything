import { memo, type ReactNode } from 'react';
import { isCamera } from '@smarteverything/domain';
import {
  boardClassOf,
  renderWidget,
  type WidgetDefinition,
  type WidgetFrameBox,
  type WidgetSize,
} from '../../../components/widget-board';
import { useSizeClass } from '../../../design/size-class';
import type { Device } from '../../../store/state';
import { CAMERA_WIDGETS } from '../../cameras';
import { DeviceSpotlightWidget } from '../../devices';
import { SPOTLIGHT_WIDGET } from '../../home';
import { fillSizeOf } from '../model/grid-fill';

const CAMERA: WidgetDefinition | undefined = CAMERA_WIDGETS.find(
  (definition) => definition.type === 'camera',
);

interface CellProps {
  readonly device: Device;
  readonly frame: WidgetFrameBox;
}

function faceOf(device: Device, frame: WidgetFrameBox, size: WidgetSize): ReactNode {
  if (isCamera(device) && CAMERA !== undefined) {
    return renderWidget(
      CAMERA,
      { size, options: { deviceId: device.id }, editing: false, frame },
      null,
    );
  }
  return <DeviceSpotlightWidget deviceId={device.id} size={size} editing={false} frame={frame} />;
}

function Cell({ device, frame }: CellProps): ReactNode {
  return faceOf(device, frame, 'M');
}

function FilledCell({ device, frame }: CellProps): ReactNode {
  const board = boardClassOf(useSizeClass().width);
  const definition = isCamera(device) && CAMERA !== undefined ? CAMERA : SPOTLIGHT_WIDGET;
  return faceOf(device, frame, fillSizeOf(definition, board));
}

export const DeviceCell = memo(Cell);

export const FilledDeviceCell = memo(FilledCell);
