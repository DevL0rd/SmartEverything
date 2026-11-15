import type { PlannerMissedReason } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { RingHub } from './ring-hub.js';
import type { DesktopRing, RingElsewhere, RingOutcomes } from './ring-types.js';

const log = new Logger('desktop.planner-ring');

export interface RingActionsHooks {
  readonly snoozed: (ring: DesktopRing) => void;
  readonly settled: (ring: DesktopRing) => void;
}

export type RingActionsHub = Pick<RingHub, 'dismiss' | 'snooze' | 'elsewhere'>;

export class RingActions implements RingOutcomes {
  readonly #hub: RingActionsHub;
  readonly #hooks: RingActionsHooks;
  readonly #origins = new Map<string, string>();

  constructor(hub: RingActionsHub, hooks: RingActionsHooks) {
    this.#hub = hub;
    this.#hooks = hooks;
  }

  dismissed = async (ring: DesktopRing): Promise<void> => {
    await this.#hub.dismiss(ring, this.#origins.get(ring.ringKey) ?? ring.dueAt);
    this.#origins.delete(ring.ringKey);
    this.#hooks.settled(ring);
    log.info('planner_ring.dismissed', { kind: ring.kind });
  };

  snoozed = async (ring: DesktopRing): Promise<void> => {
    const dueAt = this.#origins.get(ring.ringKey) ?? ring.dueAt;
    const { until, snoozes } = await this.#hub.snooze(ring, dueAt);
    this.#origins.set(ring.ringKey, dueAt);
    this.#hooks.snoozed({ ...ring, dueAt: until, snoozes: Math.max(snoozes, ring.snoozes + 1) });
    log.info('planner_ring.snoozed', { kind: ring.kind });
  };

  elsewhere = (ring: DesktopRing, now: Date): Promise<RingElsewhere> =>
    this.#hub.elsewhere(ring, this.#origins.get(ring.ringKey) ?? ring.dueAt, now);

  settledElsewhere = (
    ring: DesktopRing,
    state: Exclude<RingElsewhere, { kind: 'ringing' }>,
  ): void => {
    if (state.kind === 'snoozed') {
      this.#origins.set(ring.ringKey, this.#origins.get(ring.ringKey) ?? ring.dueAt);
      this.#hooks.snoozed({ ...ring, dueAt: state.until, snoozes: state.snoozes });
    } else {
      this.#origins.delete(ring.ringKey);
      this.#hooks.settled(ring);
    }
    log.info('planner_ring.settled_elsewhere', { kind: ring.kind, state: state.kind });
  };

  missed = (ring: DesktopRing, reason: PlannerMissedReason): Promise<void> => {
    this.#origins.delete(ring.ringKey);
    this.#hooks.settled(ring);
    log.warn('planner_ring.missed_not_reported', { kind: ring.kind, reason });
    return Promise.resolve();
  };
}
