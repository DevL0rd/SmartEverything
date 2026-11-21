import {
  PLANNER_SIGNAL_SOURCE,
  type PlannerRingNotice,
  type PlannerRingTarget,
  type PlannerSignal,
  type PlannerTimerRow,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import { Coalesced } from '../store/reader';
import type { Store } from '../store/store';
import type { TimerAction } from './units/clock';

export interface TimerPorts {
  readonly ring: (notice: PlannerRingNotice, profileId: string) => void;
  readonly signal: (signal: PlannerSignal) => void;
}

export interface TimerServiceOptions {
  readonly store: Pick<Store, 'host'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly ports: TimerPorts;
  readonly log: Logger;
}

export interface TimerStart {
  readonly durationMs: number;
  readonly label: string | null;
  readonly targets: readonly PlannerRingTarget[];
}

export class TimerService {
  private cancel: Cancel | null = null;
  private ticks: Coalesced | null = null;

  constructor(private readonly options: TimerServiceOptions) {}

  async start(): Promise<void> {
    const ticks: Coalesced = new Coalesced(
      () => this.tick(ticks, 'rang'),
      (cause) => {
        this.options.log.error('planner.timer_tick_failed', cause);
      },
    );
    this.ticks = ticks;
    await this.finishDue(ticks, 'missed');
    await this.rearm();
  }

  stop(): void {
    background(this.ticks?.stop(), 'planner.timer_stop_failed');
    this.ticks = null;
    this.cancel?.();
    this.cancel = null;
  }

  async settled(): Promise<void> {
    await this.ticks?.idle();
  }

  async begin(profileId: string, input: TimerStart): Promise<PlannerTimerRow> {
    const row = await this.options.store.host.call('plannerTimers', 'insert', {
      profile_id: profileId,
      label: input.label,
      duration_ms: input.durationMs,
      state: 'running',
      ends_at: new Date(this.now() + input.durationMs).toISOString(),
      remaining_ms: null,
      targets: input.targets,
    });
    await this.rearm();
    return row;
  }

  pause(id: string, profileId: string): Promise<PlannerTimerRow> {
    return this.change(id, profileId, { kind: 'pause' });
  }

  resume(id: string, profileId: string): Promise<PlannerTimerRow> {
    return this.change(id, profileId, { kind: 'resume' });
  }

  addTime(id: string, profileId: string, milliseconds: number): Promise<PlannerTimerRow> {
    return this.change(id, profileId, { kind: 'add', ms: milliseconds });
  }

  cancelTimer(id: string, profileId: string): Promise<PlannerTimerRow> {
    return this.change(id, profileId, { kind: 'cancel' });
  }

  private async change(
    id: string,
    profileId: string,
    action: TimerAction,
  ): Promise<PlannerTimerRow> {
    const row = await this.options.store.host.write('plannerTimerChange', {
      id,
      profileId,
      action,
      nowMs: this.now(),
    });
    await this.rearm();
    return row;
  }

  private now(): number {
    return this.options.clock.now().getTime();
  }

  private async rearm(): Promise<void> {
    const { ticks } = this;
    if (ticks === null) return;
    ticks.trigger();
    await ticks.idle();
  }

  private async tick(ticks: Coalesced, outcome: 'rang' | 'missed'): Promise<void> {
    await this.finishDue(ticks, outcome);
    const next = (await this.options.store.host.call('plannerTimers', 'running'))[0];
    if (this.ticks !== ticks) return;
    this.cancel?.();
    this.cancel = null;
    if (next?.ends_at === null || next === undefined) return;
    this.cancel = this.options.clock.at(new Date(next.ends_at), () => {
      this.cancel = null;
      ticks.trigger();
    });
  }

  private async finishDue(ticks: Coalesced, outcome: 'rang' | 'missed'): Promise<void> {
    const now = this.now();
    for (const timer of await this.options.store.host.call('plannerTimers', 'running')) {
      if (this.ticks !== ticks) return;
      if (timer.ends_at === null || Date.parse(timer.ends_at) > now) continue;
      try {
        await this.finish(timer, outcome);
      } catch (cause) {
        this.options.log.error('planner.timer_finish_failed', cause, { timerId: timer.id });
      }
    }
  }

  private async finish(timer: PlannerTimerRow, outcome: 'rang' | 'missed'): Promise<void> {
    const nowMs = this.now();
    const ring = await this.options.store.host.write('plannerTimerFinish', {
      timer,
      outcome,
      nowMs,
    });
    if (outcome === 'missed') return;
    this.options.ports.ring(
      { type: 'planner_ring', ringId: ring.id, kind: 'timer', refId: timer.id, dueAt: ring.due_at },
      timer.profile_id,
    );
    this.options.ports.signal({
      source: PLANNER_SIGNAL_SOURCE,
      kind: 'timer_done',
      subject: timer.id,
      field: null,
      value: true,
      previous: null,
      at: new Date(nowMs).toISOString(),
      profileId: timer.profile_id,
      data: { timerId: timer.id, label: timer.label, durationMs: timer.duration_ms },
    });
  }
}
