import { deviceFamily, isCamera, isClimateAppliance } from '@smarteverything/domain';
import type { Device } from '../../../store/state';

export function spotlightable(device: Device): boolean {
  return !isCamera(device) && deviceFamily(device) !== 'generic';
}

const FEATURED_AT_MOST = 3;

function screenFeature(device: Device): boolean {
  return deviceFamily(device) === 'television' && device.online;
}

export function featuredByDefault(devices: readonly Device[]): readonly Device[] {
  return [
    ...devices.filter(isClimateAppliance).slice(0, FEATURED_AT_MOST),
    ...devices.filter(screenFeature).slice(0, FEATURED_AT_MOST),
  ];
}
