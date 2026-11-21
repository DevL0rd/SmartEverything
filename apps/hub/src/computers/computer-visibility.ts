import type {
  ClientRow,
  ComputerScopes,
  DeviceRow,
  DeviceScope,
  StateRow,
} from '@smarteverything/domain';
import { phoneViewerOfCaller } from '../phones/phone-detail';
import { otherPhoneTiers, visiblePhoneValues } from '../phones/phone-visibility';
import type { Caller } from '../server/auth';
import { effectiveClientById } from '../server/person-access-units';
import { deviceHidden } from '../server/person-scope';
import { scopesOfCaller } from '../server/person-scope-units';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import { OWNER_VIEWER, viewerOf, type ComputerViewer } from './computer-access';

export function viewerOfClient(
  store: Pick<HostStore, 'profiles'>,
  client: ClientRow,
): ComputerViewer {
  if (client.role === 'owner') return OWNER_VIEWER;
  return { owner: false, profileId: store.profiles.activeOf(client.id).id };
}

export function hiddenComputer(
  store: Pick<HostStore, 'computerNodes'>,
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
  store: Pick<HostStore, 'computerNodes'>,
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

export interface ComputerAccessView {
  readonly device: DeviceRow;
  readonly visible: boolean;
  readonly scopes: ComputerScopes | null;
}

function computerVisible(
  store: Pick<HostStore, 'computerNodes'>,
  deviceId: string,
  viewer: ComputerViewer,
): boolean {
  return viewer.owner || store.computerNodes.personOf(deviceId) === viewer.profileId;
}

export const COMPUTER_ACCESS_VIEW_UNIT = storeUnit(
  (
    store,
    input: { readonly deviceId: string; readonly viewer: ComputerViewer; readonly scopes: boolean },
  ): ComputerAccessView => {
    const device = store.devices.byId(input.deviceId);
    const visible =
      device.kind === 'computer' && computerVisible(store, input.deviceId, input.viewer);
    return {
      device,
      visible,
      scopes: visible && input.scopes ? store.computerScopes.read(input.deviceId) : null,
    };
  },
);

export const COMPUTER_VISIBLE_TO_UNIT = storeUnit(
  (store, input: { readonly deviceId: string; readonly clientId: string }): boolean =>
    computerVisible(
      store,
      input.deviceId,
      viewerOfClient(store, effectiveClientById(store, input.clientId)),
    ),
);

export function visibleDevices(store: HostStore, caller: Caller): DeviceRow[] {
  const viewer = viewerOf(caller);
  const scope = scopesOfCaller(store, caller)?.devices ?? null;
  return store.devices
    .list()
    .filter((device) => !hiddenComputer(store, viewer, device) && !deviceHidden(scope, device));
}

export function visibleState(store: HostStore, caller: Caller): StateRow[] {
  const { devices, state } = visibleHome(
    store,
    viewerOf(caller),
    scopesOfCaller(store, caller)?.devices ?? null,
    { devices: store.devices.list(), state: store.state.list() },
  );
  return visiblePhoneValues(otherPhoneTiers(devices, phoneViewerOfCaller(caller)), state);
}
