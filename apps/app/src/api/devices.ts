import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.devices');

export interface DeviceChange {
  readonly display_name?: string | null;
  readonly room_id?: string | null;
  readonly hidden?: boolean;
  readonly favourite?: boolean;
  readonly position?: number;
}

export async function updateDevice(deviceId: string, change: DeviceChange): Promise<void> {
  await api().call(E.updateDevice, { params: { deviceId }, body: change });
  log.info('device.changed', { deviceId, fields: Object.keys(change).join(',') });
}
