import { presencePages } from '../plugins/shelly-presence/presence-pages';
import type { DeviceRow } from '@smarteverything/domain';
import { computerPages } from '../features/computers';
import type { DevicePageContribution } from './device-page-types';

const CONTRIBUTORS = [computerPages, presencePages];

export function contributedDevicePages(device: DeviceRow): readonly DevicePageContribution[] {
  return CONTRIBUTORS.flatMap((contribute) => contribute(device));
}
