import type { PlannerPhoneRingSet } from '@smarteverything/domain';
import { background, Logger, messageOf } from '@smarteverything/logging';
import type { RingHub } from './ring-hub.js';
import type { RingSoundStore } from './ring-sounds.js';
import {
  DESKTOP_RING_SET,
  type DesktopRing,
  type RingClock,
  type RingElsewhere,
} from './ring-types.js';

const log = new Logger('desktop.planner-ring');

export interface RingTarget {
  readonly schedule: (rings: readonly DesktopRing[]) => void;
  readonly active: () => readonly DesktopRing[];
  readonly withdraw: (ringKey: string) => void;
}

export interface RingRemote {
  readonly elsewhere: (ring: DesktopRing, now: Date) => Promise<RingElsewhere>;
  readonly settledElsewhere: (
    ring: DesktopRing,
    state: Exclude<RingElsewhere, { kind: 'ringing' }>,
  ) => void;
}

export interface RingSyncDeps {
  readonly hub: Pick<RingHub, 'readSet' | 'acknowledge'>;
  readonly target: RingTarget;
  readonly clock: RingClock;
  readonly sounds: Pick<RingSoundStore, 'install'>;
  readonly remote: RingRemote;
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
    sound: ring.sound,
    snoozeLimit: ring.snoozeLimit,
    snoozes: 0,
    challenge: ring.challenge,
  };
}

export function desktopRingsOf(set: PlannerPhoneRingSet): readonly DesktopRing[] {
  return DESKTOP_RING_SET.parse(set.rings.map(desktopRingOf));
}

export class RingSync {
  readonly #deps: RingSyncDeps;
  readonly #snoozed = new Map<string, DesktopRing>();
  #running = false;
  #again = false;
  #last: readonly DesktopRing[] = [];

  constructor(deps: RingSyncDeps) {
    this.#deps = deps;
  }

  request(): void {
    background(this.#run(), 'planner_ring.sync_failed');
  }

  snoozed(ring: DesktopRing): void {
    this.#snoozed.set(ring.ringKey, ring);
    this.#deps.target.schedule(this.#merged(this.#last));
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
      const { clientId, set } = await this.#deps.hub.readSet();
      this.#last = desktopRingsOf(set);
      const merged = this.#merged(this.#last);
      this.#deps.target.schedule(merged);
      await this.#deps.sounds.install([...merged, ...this.#deps.target.active()]);
      await this.#reconcile();
      if (await this.#deps.hub.acknowledge(clientId, set.hash)) {
        log.info('planner_ring.synced', { rings: set.rings.length });
        return;
      }
    }
  }

  async #reconcile(): Promise<void> {
    for (const ring of this.#deps.target.active()) {
      try {
        const state = await this.#deps.remote.elsewhere(ring, this.#deps.clock.now());
        if (state.kind === 'ringing') continue;
        this.#deps.target.withdraw(ring.ringKey);
        this.#deps.remote.settledElsewhere(ring, state);
      } catch (cause) {
        log.warn('planner_ring.remote_state_failed', { kind: ring.kind, reason: messageOf(cause) });
      }
    }
  }

  #merged(rings: readonly DesktopRing[]): readonly DesktopRing[] {
    const now = this.#deps.clock.now().getTime();
    for (const [key, ring] of this.#snoozed) {
      if (Date.parse(ring.dueAt) <= now) this.#snoozed.delete(key);
    }
    const keep = rings.filter((ring) => !this.#snoozed.has(ring.ringKey));
    return [...keep, ...this.#snoozed.values()];
  }
}
