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

const chosenOf = memoOnInputs(
  (state) => [state.tables.devices],
  (state): { readonly pool: readonly Device[]; readonly chosen: readonly Device[] } => {
    const pool = rowsOf(state.tables.devices).filter(
      (device) => !device.hidden && spotlightable(device),
    );
    return {
      pool,
      chosen: pool
        .filter((device) => device.favourite)
        .sort((left, right) => left.position - right.position),
    };
  },
);

const frequentOf = memoOnInputs(
  (state) => [state.tables.devices, state.tables.commands],
  (state): Favourites => ({
    chosen: false,
    title: 'Frequently used',
    devices: frequentlyUsed(state, chosenOf(state).pool),
  }),
);

export function favouritesOf(state: StoreState): Favourites {
  const { chosen } = chosenOf(state);
  return chosen.length > 0
    ? { chosen: true, title: 'Favourites', devices: chosen }
    : frequentOf(state);
}

export function sameFavourites(left: Favourites, right: Favourites): boolean {
  return (
    left.title === right.title &&
    left.devices.length === right.devices.length &&
    left.devices.every((device, index) => device === right.devices[index])
  );
}
