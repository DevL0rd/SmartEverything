import type { JsonValue } from '@smarteverything/domain';
import type { MapCloud } from '../adapters/xiaomi/map-cloud';
import type { VacuumCommandIo } from './command-service';
import type { RouteIo } from './live-route';

export type VacuumDeviceIo = RouteIo & VacuumCommandIo;

export interface VacuumLink {
  readonly io: (did: string) => VacuumDeviceIo | null;
  readonly cloud: MapCloud;
}

export class VacuumLinkMissingError extends Error {
  override readonly name = 'VacuumLinkMissingError';

  constructor() {
    super('The Xiaomi account that reaches the robot vacuum is not running.');
  }
}

export class VacuumLinkSlot {
  private held: VacuumLink | null = null;

  bind(link: VacuumLink | null): void {
    this.held = link;
  }

  io(did: string): VacuumDeviceIo | null {
    return this.held?.io(did) ?? null;
  }

  readonly cloud: MapCloud = {
    call: (path: string, data: JsonValue): Promise<JsonValue> =>
      this.linked().cloud.call(path, data),
    download: (url: string): Promise<Uint8Array> => this.linked().cloud.download(url),
  };

  private linked(): VacuumLink {
    if (this.held === null) throw new VacuumLinkMissingError();
    return this.held;
  }
}
