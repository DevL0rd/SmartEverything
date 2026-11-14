import type { PlannerMissedReason } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { RingHub } from './ring-hub.js';
import type { DesktopRing, RingOutcomes } from './ring-types.js';

const log = new Logger('desktop.planner-ring');

export interface RingActionsHooks {
  readonly snoozed: (ring: DesktopRing) => void;
  readonly settled: (ring: DesktopRing) => void;
}

export class RingActions implements RingOutcomes {
  readonly #hub: RingHub;
  readonly #hooks: RingActionsHooks;
  readonly #origins = new Map<string, string>();

  constructor(hub: RingHub, hooks: RingActionsHooks) {
    this.#hub = hub;
    this.#hooks = hooks;
  }

  dismissed = async (ring: DesktopRing): Promise<void> => {
    const dueAt = this.#origins.get(ring.ringKey) ?? ring.dueAt;
    this.#origins.delete(ring.ringKey);
    try {
      await this.#hub.dismiss(ring, dueAt);
      log.info('planner_ring.dismissed', { kind: ring.kind });
    } finally {
      this.#hooks.settled(ring);
    }
  };

  snoozed = async (ring: DesktopRing): Promise<void> => {
    const dueAt = this.#origins.get(ring.ringKey) ?? ring.dueAt;
    const { until } = await this.#hub.snooze(ring, dueAt);
    this.#origins.set(ring.ringKey, dueAt);
    this.#hooks.snoozed({ ...ring, dueAt: until });
    log.info('planner_ring.snoozed', { kind: ring.kind });
  };

  missed = (ring: DesktopRing, reason: PlannerMissedReason): Promise<void> => {
    this.#origins.delete(ring.ringKey);
    this.#hooks.settled(ring);
    log.warn('planner_ring.missed_not_reported', { kind: ring.kind, reason });
    return Promise.resolve();
  };
}
