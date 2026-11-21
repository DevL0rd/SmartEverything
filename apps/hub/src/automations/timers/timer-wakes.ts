import { AUTOMATION_TIMER_SOURCE, type SignalInput } from '@smarteverything/domain';
import { TIMER_SLOT_PREFIX } from '@smarteverything/flow/nodes/state/timer';
import type { Cancel, Clock } from '../../clock';
import type {
  AutomationNodeStateRepository,
  NodeStateRow,
  SlotKind,
} from '../../store/repositories/automation-node-state';
import { background } from '@smarteverything/logging';
import type { StoreHost } from '../../store/host/host';
import { STATE_PARTITION } from '../world-v3/node-memory';

const TIMERS: SlotKind = { partition: STATE_PARTITION, prefix: TIMER_SLOT_PREFIX };

export interface TimerRows {
  readonly due: (through: string) => Promise<NodeStateRow | undefined>;
  readonly next: () => Promise<string | null>;
  readonly clear: (row: NodeStateRow) => Promise<void>;
}

export function hostTimerRows(host: StoreHost): TimerRows {
  return {
    due: async (through) =>
      (await host.call('automationNodeState', 'dueSlots', TIMERS, through))[0],
    next: () => host.call('automationNodeState', 'nextSlotWake', TIMERS),
    clear: (row) =>
      host.call('automationNodeState', 'clearWake', row.automation_id, row.node_id, row.partition),
  };
}

export function directTimerRows(
  rows: Pick<AutomationNodeStateRepository, 'dueSlots' | 'nextSlotWake' | 'clearWake'>,
): TimerRows {
  return {
    due: (through) => Promise.resolve(rows.dueSlots(TIMERS, through)[0]),
    next: () => Promise.resolve(rows.nextSlotWake(TIMERS)),
    clear: (row): Promise<void> => {
      rows.clearWake(row.automation_id, row.node_id, row.partition);
      return Promise.resolve();
    },
  };
}

interface TimerWakesPorts {
  readonly rows: TimerRows;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly emit: (signal: SignalInput) => void;
}

export class TimerWakes {
  private pending: Cancel | undefined;
  private running = false;
  private work: Promise<void> = Promise.resolve();

  constructor(private readonly ports: TimerWakesPorts) {}

  start(): void {
    this.running = true;
    this.queue(async () => {
      await this.drain();
      await this.arm();
    });
  }

  stop(): void {
    this.running = false;
    this.pending?.();
    this.pending = undefined;
  }

  changed(): void {
    if (this.running) this.queue(() => this.arm());
  }

  settled(): Promise<void> {
    return this.work;
  }

  private queue(step: () => Promise<void>): void {
    const next = this.work.then(async () => {
      if (this.running) await step();
    });
    this.work = next.then(
      () => undefined,
      () => undefined,
    );
    background(next, 'automation.timer_wake_failed');
  }

  private async drain(): Promise<void> {
    for (;;) {
      const due = await this.ports.rows.due(this.ports.clock.now().toISOString());
      if (due === undefined || !this.running) return;
      await this.ports.rows.clear(due);
      this.finish(due);
    }
  }

  private finish(row: NodeStateRow): void {
    this.ports.emit({
      source: AUTOMATION_TIMER_SOURCE,
      kind: 'finished',
      subject: null,
      field: row.node_id.slice(TIMER_SLOT_PREFIX.length),
      value: true,
      previous: null,
      at: this.ports.clock.now().toISOString(),
      profileId: null,
      data: row.wake_at === null ? {} : { dueAt: row.wake_at },
    });
  }

  private async arm(): Promise<void> {
    const next = await this.ports.rows.next();
    this.pending?.();
    this.pending = undefined;
    if (next === null || !this.running) return;
    this.pending = this.ports.clock.at(new Date(next), () => {
      this.pending = undefined;
      this.queue(async () => {
        await this.drain();
        await this.arm();
      });
    });
  }
}
