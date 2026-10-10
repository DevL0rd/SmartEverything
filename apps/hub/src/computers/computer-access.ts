import type { ComputerScope, ComputerScopes, DeviceRow } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { apiErrorOf, ComputerScopeOffError, NotAComputerError } from './computer-errors';

export async function guarded<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    throw apiErrorOf(cause);
  }
}

export class ComputerAccess {
  constructor(private readonly store: Pick<Store, 'devices' | 'computerScopes'>) {}

  device(deviceId: string): DeviceRow {
    const device = this.store.devices.byId(deviceId);
    if (device.kind !== 'computer') {
      throw new NotAComputerError();
    }
    return device;
  }

  scopes(deviceId: string): ComputerScopes {
    this.device(deviceId);
    return this.store.computerScopes.read(deviceId);
  }

  require(deviceId: string, scope: ComputerScope): void {
    if (!this.scopes(deviceId)[scope]) {
      throw new ComputerScopeOffError(scope);
    }
  }
}
