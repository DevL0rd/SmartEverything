import { Platform } from 'react-native';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../api/transport';
import { appPlatform } from '../design/platform';
import { hardwareReportOf, phoneHardwareOf } from './phone-hardware';

const log = new Logger('app.phone-hardware');

export async function reportPhoneHardware(): Promise<void> {
  if (appPlatform() !== 'android') {
    return;
  }
  const hardware = phoneHardwareOf(Platform.constants);
  if (hardware === undefined) {
    log.warn('phone_hardware.unreadable');
    return;
  }
  await api().call(E.reportPhone, { body: hardwareReportOf(hardware, new Date()) });
  log.info('phone_hardware.reported');
}
