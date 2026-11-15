import { background, Logger } from '@smarteverything/logging';
import {
  snoozesLeft,
  stopsHere,
  type Cancel,
  type DesktopRing,
  type RingChoice,
  type RingClock,
  type RingNotifier,
  type RingOutcomes,
  type RingSurface,
} from './ring-types.js';

const log = new Logger('desktop.planner-ring');

export interface RingSchedulerDeps {
  readonly clock: RingClock;
  readonly surface: RingSurface;
  readonly notifier: RingNotifier;
  readonly outcomes: RingOutcomes;
}

function sameRing(first: DesktopRing | undefined, second: DesktopRing): boolean {
  return first !== undefined && JSON.stringify(first) === JSON.stringify(second);
}

function allowed(ring: DesktopRing, choice: RingChoice): boolean {
  return choice === 'snooze' ? snoozesLeft(ring) !== 0 : stopsHere(ring);
}

export class RingScheduler {
  readonly #deps: RingSchedulerDeps;
  readonly #pending = new Map<string, DesktopRing>();
  readonly #timers = new Map<string, Cancel>();
  readonly #active = new Map<string, DesktopRing>();
  readonly #settling = new Map<string, DesktopRing>();

  constructor(deps: RingSchedulerDeps) {
    this.#deps = deps;
  }

  schedule(rings: readonly DesktopRing[]): void {
    const wanted = new Set(rings.map((ring) => ring.ringKey));
    for (const key of [...this.#pending.keys()]) {
      if (!wanted.has(key)) this.#forget(key);
    }
    for (const ring of rings) {
      if (this.#active.has(ring.ringKey)) continue;
      if (sameRing(this.#pending.get(ring.ringKey), ring) && this.#timers.has(ring.ringKey)) {
        continue;
      }
      this.#forget(ring.ringKey);
      this.#pending.set(ring.ringKey, ring);
      this.#arm(ring);
    }
    log.info('planner_ring.scheduled', { pending: this.#pending.size });
  }

  ringNow(ring: DesktopRing): void {
    this.#forget(ring.ringKey);
    if (this.#active.has(ring.ringKey)) return;
    this.#active.set(ring.ringKey, ring);
    this.#present(ring, null);
    log.info('planner_ring.rang', { kind: ring.kind, active: this.#active.size });
  }

  active(): readonly DesktopRing[] {
    return [...this.#active.values()];
  }

  withdraw(ringKey: string): void {
    this.#forget(ringKey);
    this.#settling.delete(ringKey);
    if (this.#active.delete(ringKey)) this.#deps.surface.close(ringKey);
  }

  suspend(): void {
    for (const cancel of this.#timers.values()) cancel();
    this.#timers.clear();
  }

  resume(): void {
    this.suspend();
    const now = this.#deps.clock.now().getTime();
    const byDueTime = [...this.#pending.values()].sort(
      (first, second) => Date.parse(first.dueAt) - Date.parse(second.dueAt),
    );
    for (const ring of byDueTime) {
      if (Date.parse(ring.dueAt) <= now) {
        this.#pending.delete(ring.ringKey);
        this.#miss(ring);
      } else {
        this.#arm(ring);
      }
    }
    log.info('planner_ring.resumed', { pending: this.#pending.size });
  }

  #arm(ring: DesktopRing): void {
    this.#timers.set(
      ring.ringKey,
      this.#deps.clock.at(new Date(ring.dueAt), () => {
        this.#timers.delete(ring.ringKey);
        this.#pending.delete(ring.ringKey);
        this.ringNow(ring);
      }),
    );
  }

  #forget(ringKey: string): void {
    this.#timers.get(ringKey)?.();
    this.#timers.delete(ringKey);
    this.#pending.delete(ringKey);
  }

  #miss(ring: DesktopRing): void {
    this.#deps.notifier.missed(ring);
    background(this.#deps.outcomes.missed(ring, 'computer_asleep'), 'planner_ring.missed_failed', {
      kind: ring.kind,
    });
    log.info('planner_ring.missed', { kind: ring.kind, reason: 'computer_asleep' });
  }

  #present(ring: DesktopRing, failed: RingChoice | null): void {
    this.#deps.notifier.ringing(ring, () => {
      this.#deps.surface.focus(ring.ringKey);
    });
    this.#deps.surface.show(ring, failed, (choice) => {
      background(this.#choose(ring, choice), 'planner_ring.choice_failed', { kind: ring.kind });
    });
  }

  async #choose(ring: DesktopRing, choice: RingChoice): Promise<void> {
    if (!allowed(ring, choice)) {
      log.warn('planner_ring.choice_refused', { kind: ring.kind, choice });
      return;
    }
    if (this.#active.get(ring.ringKey) !== ring || this.#settling.has(ring.ringKey)) return;
    this.#settling.set(ring.ringKey, ring);
    try {
      await (choice === 'snooze'
        ? this.#deps.outcomes.snoozed(ring)
        : this.#deps.outcomes.dismissed(ring));
    } catch (cause) {
      if (!this.#settled(ring)) return;
      log.error('planner_ring.outcome_failed', cause, { kind: ring.kind, choice });
      this.#deps.surface.close(ring.ringKey);
      this.#present(ring, choice);
      return;
    }
    if (!this.#settled(ring)) return;
    this.#active.delete(ring.ringKey);
    this.#deps.surface.close(ring.ringKey);
    log.info('planner_ring.chosen', { kind: ring.kind, choice });
  }

  #settled(ring: DesktopRing): boolean {
    if (this.#settling.get(ring.ringKey) !== ring) return false;
    this.#settling.delete(ring.ringKey);
    return this.#active.get(ring.ringKey) === ring;
  }
}
