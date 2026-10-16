import { rowsOf, type Device, type StoreState } from '../../../store/state';
import { memoOnInputs } from '../../../store/memo-selector';
import { spotlightable } from './spotlight';

export interface Favourites {
  readonly chosen: boolean;
  readonly title: string;
  readonly devices: readonly Device[];
}

const FREQUENT_LIMIT = 8;

function frequentlyUsed(state: StoreState, devices: readonly Device[]): readonly Device[] {
  const uses = new Map<string, number>();
  for (const command of rowsOf(state.tables.commands)) {
    if (command.device_id !== null && command.source === 'app') {
      uses.set(command.device_id, (uses.get(command.device_id) ?? 0) + 1);
    }
  }
  return devices
    .filter((device) => uses.has(device.id))
    .sort((left, right) => (uses.get(right.id) ?? 0) - (uses.get(left.id) ?? 0))
    .slice(0, FREQUENT_LIMIT);
}

export const favouritesOf = memoOnInputs(
  (state) => [state.tables.devices, state.tables.commands],
  (state): Favourites => {
    const devices = rowsOf(state.tables.devices).filter(
      (device) => !device.hidden && spotlightable(device),
    );
    const favourites = devices
      .filter((device) => device.favourite)
      .sort((left, right) => left.position - right.position);
    return favourites.length > 0
      ? { chosen: true, title: 'Favourites', devices: favourites }
      : { chosen: false, title: 'Frequently used', devices: frequentlyUsed(state, devices) };
  },
);

export function sameFavourites(left: Favourites, right: Favourites): boolean {
  return (
    left.title === right.title &&
    left.devices.length === right.devices.length &&
    left.devices.every((device, index) => device === right.devices[index])
  );
}
