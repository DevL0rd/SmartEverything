import { MICROS_PER_USD, localClock, zonedInstant } from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { Transcripts } from './transcript-service';

export interface ListeningBudgetOptions {
  readonly store: Pick<Store, 'settings' | 'transcripts'>;
  readonly transcripts: Pick<Transcripts, 'settings'>;
  readonly clock: Pick<Clock, 'now'>;
}

export class ListeningBudget {
  constructor(private readonly options: ListeningBudgetOptions) {}

  spentToday(): number {
    const timeZone = this.options.store.settings.read().time_zone;
    const now = this.options.clock.now();
    const start = zonedInstant(localClock(now, timeZone), 0, timeZone);
    return this.options.store.transcripts.listeningSpent(start.toISOString());
  }

  capReached(): boolean {
    return this.spentToday() >= this.options.transcripts.settings().daily_cap_usd * MICROS_PER_USD;
  }
}
