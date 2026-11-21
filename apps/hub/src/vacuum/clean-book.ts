import type { VacuumClean } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { StoreHost } from '../store/host/host';
import type { CleanStore } from './clean-tracked';

export class CleanBookNotLoadedError extends Error {
  override readonly name = 'CleanBookNotLoadedError';

  constructor(deviceId: string) {
    super(`The vacuum cleans of device ${deviceId} were read before they were loaded.`);
  }
}

interface Held {
  readonly ids: Set<string>;
  readonly open: Map<string, VacuumClean>;
}

export class CleanBook implements CleanStore {
  private readonly devices = new Map<string, Held>();

  constructor(private readonly host: Pick<StoreHost, 'call'>) {}

  hold(deviceId: string, ids: readonly string[], open: readonly VacuumClean[]): void {
    this.devices.set(deviceId, {
      ids: new Set(ids),
      open: new Map(open.map((clean) => [clean.id, clean])),
    });
  }

  holdEmpty(deviceId: string): void {
    if (!this.devices.has(deviceId)) this.hold(deviceId, [], []);
  }

  has(deviceId: string, id: string): boolean {
    return this.held(deviceId).ids.has(id);
  }

  open(deviceId: string): VacuumClean | undefined {
    let latest: VacuumClean | undefined;
    for (const clean of this.held(deviceId).open.values())
      if (latest === undefined || clean.startedAt > latest.startedAt) latest = clean;
    return latest;
  }

  save(deviceId: string, clean: VacuumClean): void {
    const held = this.held(deviceId);
    held.ids.add(clean.id);
    if (clean.endedAt === null) held.open.set(clean.id, clean);
    else held.open.delete(clean.id);
    background(
      this.host.call('vacuumCleans', 'save', deviceId, clean),
      'vacuum_clean.save_failed',
      {
        deviceId,
        cleanId: clean.id,
      },
    );
  }

  rename(deviceId: string, from: string, to: string): void {
    const held = this.held(deviceId);
    held.ids.delete(from);
    held.ids.add(to);
    const open = held.open.get(from);
    if (open !== undefined) {
      held.open.delete(from);
      held.open.set(to, { ...open, id: to });
    }
    background(
      this.host.call('vacuumCleans', 'rename', deviceId, from, to),
      'vacuum_clean.rename_failed',
      {
        deviceId,
        cleanId: to,
      },
    );
  }

  private held(deviceId: string): Held {
    const held = this.devices.get(deviceId);
    if (held === undefined) throw new CleanBookNotLoadedError(deviceId);
    return held;
  }
}
