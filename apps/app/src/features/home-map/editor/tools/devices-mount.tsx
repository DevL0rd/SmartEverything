import type { ReactNode } from 'react';
import { coneEdit, selectedCamera, withCone } from './camera-pose';
import type { DeviceRoomFlow } from './device-room-flow';
import { DevicesPanel } from './device-tray';
import { useDevicesTool, type DevicesToolInput } from './devices';
import { armedNotice, devicesOverlay } from './devices-model';
import { NO_EDIT_FIELDS, type MountArgs, type MountEditFields } from '../mount-edit';

export interface DevicesMount extends MountEditFields {
  readonly panel: ReactNode;
  readonly bar: ReactNode;
}

export type MountDevices = (args: MountArgs) => DevicesMount;

export function useDevicesMount(input: DevicesToolInput, flow: DeviceRoomFlow): MountDevices {
  const tool = useDevicesTool(input, flow);
  return () => ({
    ...NO_EDIT_FIELDS,
    overlay: withCone(devicesOverlay(tool), selectedCamera(tool.floor, tool.selected)),
    onEdit: coneEdit(tool, input.commit),
    notice: tool.readOnly ? null : armedNotice(tool.armed),
    panel: <DevicesPanel tool={tool} />,
    bar: null,
  });
}
