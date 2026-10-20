import { AUTOMATION_TIMER_SOURCE, type SignalInput } from '@smarteverything/domain';
import { TIMER_SLOT_PREFIX } from '@smarteverything/flow/nodes/state/timer';
import type { Cancel, Clock } from '../../clock';
import type {
  AutomationNodeStateRepository,
  NodeStateRow,
  SlotKind,
} from '../../store/repositories/automation-node-state';
import { STATE_PARTITION } from '../world-v3/node-memory';

const TIMERS: SlotKind = { partition: STATE_PARTITION, prefix: TIMER_SLOT_PREFIX };

interface TimerWakesPorts {
  readonly rows: Pick<AutomationNodeStateRepository, 'dueSlots' | 'nextSlotWake' | 'clearWake'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly emit: (signal: SignalInput) => void;
}

export class TimerWakes {
  private pending: Cancel | undefined;
  private running = false;

  constructor(private readonly ports: TimerWakesPorts) {}

  start(): void {
    this.running = true;
    this.drain();
    this.arm();
  }

  stop(): void {
    this.running = false;
    this.pending?.();
    this.pending = undefined;
  }

  changed(): void {
    if (this.running) this.arm();
  }

  private drain(): void {
    for (;;) {
      const [due] = this.ports.rows.dueSlots(TIMERS, this.ports.clock.now().toISOString());
      if (due === undefined) return;
      this.ports.rows.clearWake(due.automation_id, due.node_id, due.partition);
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

  private arm(): void {
    this.pending?.();
    this.pending = undefined;
    const next = this.ports.rows.nextSlotWake(TIMERS);
    if (next === null) return;
    this.pending = this.ports.clock.at(new Date(next), () => {
      this.pending = undefined;
      this.drain();
      this.arm();
    });
  }
}
