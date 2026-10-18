import type {
  ClientRow,
  ComputerScope,
  ComputerScopes,
  DeviceRow,
  DeviceScope,
  StateRow,
} from '@smarteverything/domain';
import { phoneViewerOfCaller } from '../phones/phone-detail';
import { otherPhoneTiers, visiblePhoneValues } from '../phones/phone-visibility';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import { deviceHidden, scopesOfCaller } from '../server/person-scope';
import type { Store } from '../store/store';
import { apiErrorOf, ComputerScopeOffError, NotAComputerError } from './computer-errors';

export type ComputerAccessStore = Pick<
  Store,
  'devices' | 'computerScopes' | 'computerNodes' | 'profiles'
>;

export interface ComputerViewer {
  readonly owner: boolean;
  readonly profileId: string | null;
}

const OWNER_VIEWER: ComputerViewer = { owner: true, profileId: null };

export async function guarded<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    throw apiErrorOf(cause);
  }
}

export function viewerOf(store: Store, caller: Caller): ComputerViewer {
  if (roleOfCaller(caller) === 'owner') return OWNER_VIEWER;
  return { owner: false, profileId: profileIdOf(store, caller) };
}

export function viewerOfClient(store: Pick<Store, 'profiles'>, client: ClientRow): ComputerViewer {
  if (client.role === 'owner') return OWNER_VIEWER;
  return { owner: false, profileId: store.profiles.activeOf(client.id).id };
}

export function hiddenComputer(
  store: Pick<Store, 'computerNodes'>,
  viewer: ComputerViewer,
  device: Pick<DeviceRow, 'id' | 'kind'>,
): boolean {
  if (viewer.owner || device.kind !== 'computer') return false;
  return store.computerNodes.personOf(device.id) !== viewer.profileId;
}

export function visibleHome<
  D extends Pick<DeviceRow, 'id' | 'kind' | 'room_id'>,
  S extends { readonly device_id: string },
>(
  store: Pick<Store, 'computerNodes'>,
  viewer: ComputerViewer,
  scope: DeviceScope | null,
  home: { readonly devices: readonly D[]; readonly state: readonly S[] },
): { readonly devices: D[]; readonly state: S[] } {
  const hidden = new Set(
    home.devices
      .filter((device) => hiddenComputer(store, viewer, device) || deviceHidden(scope, device))
      .map((device) => device.id),
  );
  return {
    devices: home.devices.filter((device) => !hidden.has(device.id)),
    state: home.state.filter((row) => !hidden.has(row.device_id)),
  };
}

export class ComputerAccess {
  constructor(private readonly store: ComputerAccessStore) {}

  visible(deviceId: string, viewer: ComputerViewer): boolean {
    return viewer.owner || this.store.computerNodes.personOf(deviceId) === viewer.profileId;
  }

  watchable(deviceId: string, viewer: ComputerViewer): boolean {
    const device = this.store.devices.find(deviceId);
    if (device === undefined) return false;
    return device.kind !== 'computer' || this.visible(deviceId, viewer);
  }

  device(deviceId: string, viewer: ComputerViewer): DeviceRow {
    const device = this.store.devices.byId(deviceId);
    if (device.kind !== 'computer' || !this.visible(deviceId, viewer)) {
      throw new NotAComputerError();
    }
    return device;
  }

  scopes(deviceId: string, viewer: ComputerViewer): ComputerScopes {
    this.device(deviceId, viewer);
    return this.store.computerScopes.read(deviceId);
  }

  require(deviceId: string, scope: ComputerScope, viewer: ComputerViewer): void {
    if (!this.scopes(deviceId, viewer)[scope]) {
      throw new ComputerScopeOffError(scope);
    }
  }
}

export function visibleDevices(store: Store, caller: Caller): DeviceRow[] {
  const viewer = viewerOf(store, caller);
  const scope = scopesOfCaller(store, caller)?.devices ?? null;
  return store.devices
    .list()
    .filter((device) => !hiddenComputer(store, viewer, device) && !deviceHidden(scope, device));
}

export function visibleState(store: Store, caller: Caller): StateRow[] {
  const { devices, state } = visibleHome(
    store,
    viewerOf(store, caller),
    scopesOfCaller(store, caller)?.devices ?? null,
    { devices: store.devices.list(), state: store.state.list() },
  );
  return visiblePhoneValues(otherPhoneTiers(devices, phoneViewerOfCaller(store, caller)), state);
}
