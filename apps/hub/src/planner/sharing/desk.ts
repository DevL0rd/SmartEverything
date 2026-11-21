import type { SignalInput } from '@smarteverything/domain';
import type { Clock } from '../../clock';
import type { Store } from '../../store/store';
import { followGuests } from '../guests/rsvp';
import { PendingWork } from '../pending-work';
import { followAssignment } from './assignment';

export interface CollaborationDeskOptions {
  readonly store: Pick<Store, 'feed' | 'host'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly emit: (signal: SignalInput) => void;
}

export class CollaborationDesk {
  private unsubscribe: (() => void) | null = null;
  private readonly work = new PendingWork('planner.collaboration_follow_failed');

  constructor(private readonly options: CollaborationDeskOptions) {}

  start(): void {
    const settings = {
      store: this.options.store,
      now: this.options.clock.now,
      emit: this.options.emit,
    };
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      this.work.run(followAssignment(settings, change));
      this.work.run(followGuests(settings, change));
    });
  }

  settled(): Promise<void> {
    return this.work.settled();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
