import type { SignalInput } from '@smarteverything/domain';
import type { Clock } from '../../clock';
import type { Store } from '../../store/store';
import { followGuests } from '../guests/rsvp';
import { followAssignment } from './assignment';

export interface CollaborationDeskOptions {
  readonly store: Pick<Store, 'feed' | 'plannerItems'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly emit: (signal: SignalInput) => void;
}

export class CollaborationDesk {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: CollaborationDeskOptions) {}

  start(): void {
    const settings = {
      store: this.options.store,
      now: this.options.clock.now,
      emit: this.options.emit,
    };
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      followAssignment(settings, change);
      followGuests(settings, change);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
