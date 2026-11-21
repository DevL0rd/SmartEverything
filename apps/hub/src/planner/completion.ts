import {
  PLANNER_SIGNAL,
  PLANNER_SIGNAL_SOURCE,
  type PlannerOccurrenceRow,
  type SignalInput,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { SignalListener } from '../signals/bus';
import type { Store } from '../store/store';
import { PendingWork } from './pending-work';
import type { Completed } from './units/completion';

export type CompletionStore = Pick<Store, 'host'>;

export interface CompletionWatcherOptions {
  readonly store: CompletionStore;
  readonly clock: Pick<Clock, 'now'>;
  readonly emit: (signal: SignalInput) => void;
  readonly log: Logger;
}

export interface SignalSource {
  readonly subscribe: (listener: SignalListener) => () => void;
}

export class CompletionWatcher {
  private readonly work = new PendingWork('planner.signal_completion_failed');

  constructor(private readonly options: CompletionWatcherOptions) {}

  attach(source: SignalSource): () => void {
    return source.subscribe((signal) => {
      this.work.run(this.handle(signal), { source: signal.source, kind: signal.kind });
    });
  }

  settled(): Promise<void> {
    return this.work.settled();
  }

  async handle(signal: SignalInput): Promise<readonly PlannerOccurrenceRow[]> {
    if (signal.source === PLANNER_SIGNAL_SOURCE) return [];
    const { host } = this.options.store;
    if (!(await host.read('plannerSignalWanted', { signal }))) return [];
    const completed = await host.write('plannerSignalComplete', {
      signal,
      nowMs: this.options.clock.now().getTime(),
    });
    for (const entry of completed) this.announce(entry);
    return completed.map((entry) => entry.row);
  }

  private announce({ item, view }: Completed): void {
    this.options.emit(
      PLANNER_SIGNAL.parse({
        source: PLANNER_SIGNAL_SOURCE,
        kind: 'task_done',
        subject: item.id,
        field: null,
        value: view.occurrence_key,
        previous: null,
        at: this.options.clock.now().toISOString(),
        profileId: item.profile_id,
        data: {
          itemId: item.id,
          occurrenceKey: view.occurrence_key,
          title: item.title,
          dueAt: view.due_at,
          completedBy: 'signal',
        },
      }),
    );
  }
}
