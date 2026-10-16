import { deviceFamily, isCamera, isClimateAppliance } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import { rowsOf, type Device } from '../../../store/state';
import { isOffline } from '../../devices';

export function spotlightable(device: Device): boolean {
  return !isCamera(device) && deviceFamily(device) !== 'generic';
}

const FEATURED_AT_MOST = 3;

function screenFeature(device: Device): boolean {
  return deviceFamily(device) === 'television' && device.online;
}

function featuredByDefault(devices: readonly Device[]): readonly Device[] {
  return [
    ...devices.filter(isClimateAppliance).slice(0, FEATURED_AT_MOST),
    ...devices.filter(screenFeature).slice(0, FEATURED_AT_MOST),
  ];
}

export interface DeviceDigest {
  readonly count: number;
  readonly offline: number;
  readonly spotlightable: readonly string[];
  readonly featured: readonly string[];
}

export const deviceDigest = memoOnInputs(
  (state) => [state.tables.devices],
  (state): DeviceDigest => {
    const devices = rowsOf(state.tables.devices).filter((device) => !device.hidden);
    return {
      count: devices.length,
      offline: devices.filter(isOffline).length,
      spotlightable: devices.filter(spotlightable).map((device) => device.id),
      featured: featuredByDefault(devices).map((device) => device.id),
    };
  },
);

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function sameDigest(left: DeviceDigest, right: DeviceDigest): boolean {
  return (
    left.count === right.count &&
    left.offline === right.offline &&
    sameIds(left.spotlightable, right.spotlightable) &&
    sameIds(left.featured, right.featured)
  );
}
