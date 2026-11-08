import {
  ApiError,
  PLANNER_SIGNAL_SOURCE,
  type PlannerRingNotice,
  type PlannerRingTarget,
  type PlannerSignal,
  type PlannerTimerRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { PlannerTimerPatch } from '../store/repositories/planner-timers';
import type { Store } from '../store/store';

export interface TimerPorts {
  readonly ring: (notice: PlannerRingNotice, profileId: string) => void;
  readonly signal: (signal: PlannerSignal) => void;
}

export interface TimerServiceOptions {
  readonly store: Store;
  readonly clock: Clock;
  readonly ports: TimerPorts;
  readonly log: Logger;
}

export interface TimerStart {
  readonly durationMs: number;
  readonly label: string | null;
  readonly targets: readonly PlannerRingTarget[];
}

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function remainingOf(timer: PlannerTimerRow, now: number): number {
  if (timer.ends_at === null) return timer.remaining_ms ?? 0;
  return Math.max(Date.parse(timer.ends_at) - now, 0);
}

export class TimerService {
  private cancel: Cancel | null = null;

  constructor(private readonly options: TimerServiceOptions) {}

  start(): void {
    const now = this.now();
    for (const timer of this.options.store.plannerTimers.running()) {
      if (timer.ends_at !== null && Date.parse(timer.ends_at) <= now) this.finish(timer, 'missed');
    }
    this.arm();
  }

  stop(): void {
    this.cancel?.();
    this.cancel = null;
  }

  begin(profileId: string, input: TimerStart): PlannerTimerRow {
    const row = this.options.store.plannerTimers.insert({
      profile_id: profileId,
      label: input.label,
      duration_ms: input.durationMs,
      state: 'running',
      ends_at: iso(this.now() + input.durationMs),
      remaining_ms: null,
      targets: input.targets,
    });
    this.arm();
    return row;
  }

  pause(id: string, profileId: string): PlannerTimerRow {
    const timer = this.options.store.plannerTimers.byId(id, profileId);
    if (timer.state !== 'running')
      throw new ApiError('conflict', 'Only a running timer can pause.');
    const row = this.options.store.plannerTimers.update(id, profileId, {
      state: 'paused',
      ends_at: null,
      remaining_ms: remainingOf(timer, this.now()),
    });
    this.arm();
    return row;
  }

  resume(id: string, profileId: string): PlannerTimerRow {
    const timer = this.options.store.plannerTimers.byId(id, profileId);
    if (timer.state !== 'paused') throw new ApiError('conflict', 'Only a paused timer can resume.');
    const row = this.options.store.plannerTimers.update(id, profileId, {
      state: 'running',
      ends_at: iso(this.now() + remainingOf(timer, 0)),
      remaining_ms: null,
    });
    this.arm();
    return row;
  }

  addTime(id: string, profileId: string, milliseconds: number): PlannerTimerRow {
    const timer = this.options.store.plannerTimers.byId(id, profileId);
    if (timer.state === 'cancelled') throw new ApiError('conflict', 'A cancelled timer is gone.');
    const row = this.options.store.plannerTimers.update(
      id,
      profileId,
      this.extension(timer, milliseconds),
    );
    this.dismissRings(timer);
    this.arm();
    return row;
  }

  cancelTimer(id: string, profileId: string): PlannerTimerRow {
    const timer = this.options.store.plannerTimers.byId(id, profileId);
    if (timer.state === 'cancelled') return timer;
    const row = this.options.store.plannerTimers.update(id, profileId, {
      state: 'cancelled',
      ends_at: null,
      remaining_ms: null,
    });
    this.dismissRings(timer);
    this.arm();
    return row;
  }

  private extension(timer: PlannerTimerRow, milliseconds: number): PlannerTimerPatch {
    if (timer.state === 'running') {
      return {
        duration_ms: timer.duration_ms + milliseconds,
        ends_at: iso(Date.parse(timer.ends_at ?? '') + milliseconds),
      };
    }
    if (timer.state === 'paused') {
      return {
        duration_ms: timer.duration_ms + milliseconds,
        remaining_ms: (timer.remaining_ms ?? 0) + milliseconds,
      };
    }
    return {
      duration_ms: milliseconds,
      state: 'running',
      ends_at: iso(this.now() + milliseconds),
      remaining_ms: null,
    };
  }

  private now(): number {
    return this.options.clock.now().getTime();
  }

  private arm(): void {
    this.cancel?.();
    this.cancel = null;
    const next = this.options.store.plannerTimers.running()[0];
    if (next?.ends_at === null || next === undefined) return;
    this.cancel = this.options.clock.at(new Date(next.ends_at), () => {
      this.fire();
    });
  }

  private fire(): void {
    this.cancel = null;
    const now = this.now();
    for (const timer of this.options.store.plannerTimers.running()) {
      if (timer.ends_at === null || Date.parse(timer.ends_at) > now) continue;
      try {
        this.finish(timer, 'rang');
      } catch (cause) {
        this.options.log.error('planner.timer_finish_failed', cause, { timerId: timer.id });
      }
    }
    this.arm();
  }

  private finish(timer: PlannerTimerRow, outcome: 'rang' | 'missed'): void {
    const dueAt = timer.ends_at ?? iso(this.now());
    const at = iso(this.now());
    this.options.store.plannerTimers.update(timer.id, timer.profile_id, {
      state: 'done',
      ends_at: null,
      remaining_ms: null,
    });
    const ring = this.options.store.plannerRings.insert({
      kind: 'timer',
      ref_id: timer.id,
      profile_id: timer.profile_id,
      due_at: dueAt,
      rang_at: outcome === 'rang' ? at : null,
      dismissed_at: null,
      snoozes: 0,
      target: null,
      outcome,
      missed_reason: outcome === 'missed' ? 'hub_down' : null,
    });
    if (outcome === 'missed') return;
    this.options.ports.ring(
      { type: 'planner_ring', ringId: ring.id, kind: 'timer', refId: timer.id, dueAt },
      timer.profile_id,
    );
    this.options.ports.signal({
      source: PLANNER_SIGNAL_SOURCE,
      kind: 'timer_done',
      subject: timer.id,
      field: null,
      value: true,
      previous: null,
      at,
      profileId: timer.profile_id,
      data: { timerId: timer.id, label: timer.label, durationMs: timer.duration_ms },
    });
  }

  private dismissRings(timer: PlannerTimerRow): void {
    const at = iso(this.now());
    for (const ring of this.options.store.plannerRings.forRef('timer', timer.id)) {
      if (ring.outcome === 'rang' && ring.dismissed_at === null) {
        this.options.store.plannerRings.update(ring.id, { dismissed_at: at });
      }
    }
  }
}
