import type { ComputerScope, ComputerScopes, DeviceRow } from '@smarteverything/domain';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import type { Store } from '../store/store';
import { apiErrorOf, ComputerScopeOffError, NotAComputerError } from './computer-errors';
import type { ComputerAccessView } from './computer-visibility';

export type ComputerAccessStore = Pick<Store, 'host' | 'live'>;

export interface ComputerViewer {
  readonly owner: boolean;
  readonly profileId: string | null;
}

export const OWNER_VIEWER: ComputerViewer = { owner: true, profileId: null };

export async function guarded<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    throw apiErrorOf(cause);
  }
}

export function viewerOf(caller: Caller): ComputerViewer {
  if (roleOfCaller(caller) === 'owner') return OWNER_VIEWER;
  return { owner: false, profileId: profileIdOf(caller) };
}

export class ComputerAccess {
  constructor(private readonly store: ComputerAccessStore) {}

  visible(deviceId: string, viewer: ComputerViewer): boolean {
    return this.store.live.computerAccess.visible(deviceId, viewer);
  }

  watchable(deviceId: string, viewer: ComputerViewer): boolean {
    return this.store.live.computerAccess.watchable(deviceId, viewer);
  }

  visibleTo(deviceId: string, clientId: string): Promise<boolean> {
    return this.store.host.read('computerVisibleTo', { deviceId, clientId });
  }

  async device(deviceId: string, viewer: ComputerViewer): Promise<DeviceRow> {
    return (await this.view(deviceId, viewer, false)).device;
  }

  async scopes(deviceId: string, viewer: ComputerViewer): Promise<ComputerScopes> {
    const { scopes } = await this.view(deviceId, viewer, true);
    if (scopes === null) throw new NotAComputerError();
    return scopes;
  }

  async require(deviceId: string, scope: ComputerScope, viewer: ComputerViewer): Promise<void> {
    if (!(await this.scopes(deviceId, viewer))[scope]) {
      throw new ComputerScopeOffError(scope);
    }
  }

  private async view(
    deviceId: string,
    viewer: ComputerViewer,
    scopes: boolean,
  ): Promise<ComputerAccessView> {
    const view = await this.store.host.read('computerAccessView', { deviceId, viewer, scopes });
    if (!view.visible) throw new NotAComputerError();
    return view;
  }
}
