import type { DeviceRow, LiveChange, ProcessWindow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { deviceTarget, type Viewers } from '../metrics/viewers';
import type { Store } from '../store/store';
import type { PhoneActionBroker } from './phone-actions';
import type { PhoneTarget } from './phone-nodes';

export const LIVE_RENEW_MS = 9 * 60 * 1000;

const LIVE_TOPIC = 'live';

export interface PhoneLiveOptions {
  readonly store: Pick<Store, 'devices' | 'feed'>;
  readonly viewers: Pick<Viewers<ProcessWindow>, 'follow'>;
  readonly actions: Pick<PhoneActionBroker, 'live'>;
  readonly target: (device: DeviceRow) => PhoneTarget;
  readonly log: Logger;
}

class Lease {
  private watching = false;
  private missed = false;
  private renewal: NodeJS.Timeout | null = null;

  constructor(private readonly unfollow: () => void) {}

  get watched(): boolean {
    return this.watching;
  }

  get unreached(): boolean {
    return this.missed;
  }

  watch(watching: boolean): boolean {
    if (this.watching === watching) return false;
    this.watching = watching;
    this.disarm();
    return true;
  }

  answered(on: boolean, ok: boolean): void {
    this.missed = on && !ok;
  }

  arm(renew: () => void): void {
    this.disarm();
    this.renewal = setTimeout(() => {
      this.renewal = null;
      renew();
    }, LIVE_RENEW_MS);
    this.renewal.unref();
  }

  end(): void {
    this.unfollow();
    this.disarm();
  }

  private disarm(): void {
    if (this.renewal === null) return;
    clearTimeout(this.renewal);
    this.renewal = null;
  }
}

export class PhoneLive {
  private readonly leases = new Map<string, Lease>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: PhoneLiveOptions) {}

  start(): void {
    this.options.store.devices
      .list()
      .filter((device) => device.kind === 'phone')
      .forEach((device) => {
        this.track(device.id);
      });
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      this.deviceChanged(change);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    [...this.leases.keys()].forEach((deviceId) => {
      this.untrack(deviceId);
    });
  }

  reported(deviceId: string): void {
    const lease = this.leases.get(deviceId);
    if (lease?.watched === true && lease.unreached) {
      this.push(deviceId, lease, true);
    }
  }

  private deviceChanged(change: LiveChange): void {
    if (change.table !== 'devices') return;
    if (change.operation === 'DELETE') {
      if (change.oldRecord !== null) this.untrack(change.oldRecord.id);
      return;
    }
    if (change.record?.kind === 'phone') this.track(change.record.id);
  }

  private track(deviceId: string): void {
    if (this.leases.has(deviceId)) return;
    const unfollow = this.options.viewers.follow(deviceTarget(deviceId), (demand) => {
      this.demanded(deviceId, demand.topics.has(LIVE_TOPIC));
    });
    this.leases.set(deviceId, new Lease(unfollow));
  }

  private untrack(deviceId: string): void {
    this.leases.get(deviceId)?.end();
    this.leases.delete(deviceId);
  }

  private demanded(deviceId: string, watched: boolean): void {
    const lease = this.leases.get(deviceId);
    if (lease?.watch(watched) === true) this.push(deviceId, lease, watched);
  }

  private push(deviceId: string, lease: Lease, on: boolean): void {
    const device = this.options.store.devices.find(deviceId);
    if (device === undefined) return;
    if (on) {
      lease.arm(() => {
        this.push(deviceId, lease, true);
      });
    }
    this.options.actions.live(this.options.target(device), on).then(
      (result) => {
        lease.answered(on, result.ok);
        if (!result.ok) {
          this.options.log.warn('phone.live_refused', {
            device: deviceId,
            on,
            detail: result.detail,
          });
        }
      },
      (cause: unknown) => {
        this.options.log.error('phone.live_failed', cause, { device: deviceId, on });
      },
    );
  }
}
