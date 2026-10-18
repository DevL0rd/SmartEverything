import { background } from '@smarteverything/logging';
import type { ShellyDevice } from '@smarteverything/shelly';
import { ValueStore } from '../../design/external-store';

type LeasePhase = 'off' | 'starting' | 'held' | 'failed';

export interface Lease {
  readonly count: number;
  readonly phase: LeasePhase;
  readonly error: string | null;
}

export type LiveSupport = 'ready' | 'offline' | 'unsupported';

const IDLE_LEASE: Lease = { count: 0, phase: 'off', error: null };

export function liveSupport(sensor: ShellyDevice): LiveSupport {
  if (sensor.connection.state !== 'online') return 'offline';
  return sensor.features.some((feature) => feature.id === 'live_track' && feature.available)
    ? 'ready'
    : 'unsupported';
}

export interface LeaseHooks {
  readonly send: (externalId: string, enabled: boolean) => Promise<void>;
  readonly describe: (cause: unknown) => string;
  readonly onFailure: (kind: 'start' | 'release', externalId: string, cause: unknown) => void;
}

export class TrackingLeases {
  readonly store = new ValueStore<ReadonlyMap<string, Lease>>(new Map());

  private readonly settling = new Set<string>();

  constructor(private readonly hooks: LeaseHooks) {}

  read(externalId: string): Lease {
    return this.store.get().get(externalId) ?? IDLE_LEASE;
  }

  acquire(externalId: string): () => void {
    this.write(externalId, (lease) => ({ ...lease, count: lease.count + 1 }));
    this.settle(externalId);
    let held = true;
    return (): void => {
      if (!held) return;
      held = false;
      this.write(externalId, (lease) => ({ ...lease, count: lease.count - 1 }));
      this.settle(externalId);
    };
  }

  retry(externalId: string): void {
    if (this.read(externalId).phase !== 'failed') return;
    this.write(externalId, (lease) => ({ ...lease, phase: 'off', error: null }));
    this.settle(externalId);
  }

  private write(externalId: string, change: (lease: Lease) => Lease): void {
    const next = change(this.read(externalId));
    this.store.update((leases) => {
      const copy = new Map(leases);
      if (next.count === 0 && next.phase === 'off') copy.delete(externalId);
      else copy.set(externalId, next);
      return copy;
    });
  }

  private settle(externalId: string): void {
    if (this.settling.has(externalId)) return;
    this.settling.add(externalId);
    background(
      this.drain(externalId).finally(() => {
        this.settling.delete(externalId);
      }),
      'live_view.settle_failed',
    );
  }

  private async drain(externalId: string): Promise<void> {
    for (;;) {
      const lease = this.read(externalId);
      const wanted = lease.count > 0;
      if (wanted && lease.phase === 'off') await this.start(externalId);
      else if (!wanted && lease.phase === 'held') await this.release(externalId);
      else if (!wanted && lease.phase === 'failed')
        this.write(externalId, (current) => ({ ...current, phase: 'off', error: null }));
      else return;
    }
  }

  private async start(externalId: string): Promise<void> {
    this.write(externalId, (lease) => ({ ...lease, phase: 'starting', error: null }));
    try {
      await this.hooks.send(externalId, true);
      this.write(externalId, (lease) => ({ ...lease, phase: 'held' }));
    } catch (cause) {
      this.hooks.onFailure('start', externalId, cause);
      this.write(externalId, (lease) => ({
        ...lease,
        phase: 'failed',
        error: this.hooks.describe(cause),
      }));
    }
  }

  private async release(externalId: string): Promise<void> {
    try {
      await this.hooks.send(externalId, false);
    } catch (cause) {
      this.hooks.onFailure('release', externalId, cause);
    }
    this.write(externalId, (lease) => ({ ...lease, phase: 'off' }));
  }
}
