import { background, Logger } from '@smarteverything/logging';
import type {
  Cancel,
  DesktopRing,
  RingChoice,
  RingClock,
  RingNotifier,
  RingOutcomes,
  RingSurface,
} from './ring-types.js';

const log = new Logger('desktop.planner-ring');

export interface RingSchedulerDeps {
  readonly clock: RingClock;
  readonly surface: RingSurface;
  readonly notifier: RingNotifier;
  readonly outcomes: RingOutcomes;
}

function sameRing(first: DesktopRing | undefined, second: DesktopRing): boolean {
  return first?.dueAt === second.dueAt && first.rampSeconds === second.rampSeconds;
}

export class RingScheduler {
  readonly #deps: RingSchedulerDeps;
  readonly #pending = new Map<string, DesktopRing>();
  readonly #timers = new Map<string, Cancel>();
  readonly #active = new Map<string, DesktopRing>();

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
    this.#deps.notifier.ringing(ring, () => {
      this.#deps.surface.focus(ring.ringKey);
    });
    this.#deps.surface.show(ring, (choice) => {
      this.#choose(ring, choice);
    });
    log.info('planner_ring.rang', { kind: ring.kind, active: this.#active.size });
  }

  withdraw(ringKey: string): void {
    this.#forget(ringKey);
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

  #choose(ring: DesktopRing, choice: RingChoice): void {
    if (!this.#active.delete(ring.ringKey)) return;
    this.#deps.surface.close(ring.ringKey);
    const work =
      choice === 'snooze' ? this.#deps.outcomes.snoozed(ring) : this.#deps.outcomes.dismissed(ring);
    background(work, 'planner_ring.outcome_failed', { kind: ring.kind, choice });
  }
}
