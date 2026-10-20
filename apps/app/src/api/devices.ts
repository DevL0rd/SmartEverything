import {
  API_ENDPOINTS as E,
  type ButtonAction,
  type LaundryNoticeChange,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.devices');

export interface DeviceChange {
  readonly display_name?: string | null;
  readonly room_id?: string | null;
  readonly hidden?: boolean;
  readonly favourite?: boolean;
  readonly position?: number;
  readonly input_names?: Readonly<Record<string, string>>;
  readonly wake_address?: string | null;
}

export async function updateDevice(deviceId: string, change: DeviceChange): Promise<void> {
  await api().call(E.updateDevice, { params: { deviceId }, body: change });
  log.info('device.changed', { deviceId, fields: Object.keys(change).join(',') });
}

export async function recordDeviceRefill(deviceId: string): Promise<void> {
  await api().call(E.recordDeviceRefill, { params: { deviceId } });
  log.info('device.refilled', { deviceId });
}

export async function updateLaundryNotices(
  deviceId: string,
  change: LaundryNoticeChange,
): Promise<void> {
  await api().call(E.updateLaundryNotices, { params: { deviceId }, body: change });
  log.info('device.laundry_notices_changed', { deviceId, fields: Object.keys(change).join(',') });
}

export async function pressDeviceButton(deviceId: string, action: ButtonAction): Promise<number> {
  const result = await api().call(E.pressDeviceButton, { params: { deviceId }, body: { action } });
  log.info('device.button_pressed', { deviceId, action, automations: result.automations.length });
  return result.automations.length;
}
