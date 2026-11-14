import type { PlannerPhoneRingSet } from '@smarteverything/domain';
import { background, Logger, messageOf } from '@smarteverything/logging';
import type { RingHub } from './ring-hub.js';
import { DESKTOP_RING_SET, type DesktopRing, type RingClock } from './ring-types.js';

const log = new Logger('desktop.planner-ring');

export interface RingTarget {
  readonly schedule: (rings: readonly DesktopRing[]) => void;
}

type PhoneRing = PlannerPhoneRingSet['rings'][number];

export function desktopRingOf(ring: PhoneRing): DesktopRing {
  return {
    ringKey: ring.ringKey,
    kind: ring.kind,
    refId: ring.refId,
    dueAt: ring.dueAt,
    label: ring.label,
    rampSeconds: ring.rampSeconds,
  };
}

export function desktopRingsOf(set: PlannerPhoneRingSet): readonly DesktopRing[] {
  return DESKTOP_RING_SET.parse(set.rings.map(desktopRingOf));
}

export class RingSync {
  readonly #hub: RingHub;
  readonly #target: RingTarget;
  readonly #clock: RingClock;
  readonly #snoozed = new Map<string, DesktopRing>();
  #running = false;
  #again = false;
  #last: readonly DesktopRing[] = [];

  constructor(hub: RingHub, target: RingTarget, clock: RingClock) {
    this.#hub = hub;
    this.#target = target;
    this.#clock = clock;
  }

  request(): void {
    background(this.#run(), 'planner_ring.sync_failed');
  }

  snoozed(ring: DesktopRing): void {
    this.#snoozed.set(ring.ringKey, ring);
    this.#target.schedule(this.#merged(this.#last));
  }

  settled(ring: DesktopRing): void {
    this.#snoozed.delete(ring.ringKey);
    this.request();
  }

  async #run(): Promise<void> {
    if (this.#running) {
      this.#again = true;
      return;
    }
    this.#running = true;
    try {
      let pending = true;
      while (pending) {
        this.#again = false;
        await this.#once();
        pending = this.#requestedAgain();
      }
    } catch (cause) {
      log.warn('planner_ring.sync_failed', { reason: messageOf(cause) });
    } finally {
      this.#running = false;
    }
  }

  #requestedAgain(): boolean {
    return this.#again;
  }

  async #once(): Promise<void> {
    for (;;) {
      const { clientId, set } = await this.#hub.readSet();
      this.#last = desktopRingsOf(set);
      this.#target.schedule(this.#merged(this.#last));
      if (await this.#hub.acknowledge(clientId, set.hash)) {
        log.info('planner_ring.synced', { rings: set.rings.length });
        return;
      }
    }
  }

  #merged(rings: readonly DesktopRing[]): readonly DesktopRing[] {
    const now = this.#clock.now().getTime();
    for (const [key, ring] of this.#snoozed) {
      if (Date.parse(ring.dueAt) <= now) this.#snoozed.delete(key);
    }
    const keep = rings.filter((ring) => !this.#snoozed.has(ring.ringKey));
    return [...keep, ...this.#snoozed.values()];
  }
}
