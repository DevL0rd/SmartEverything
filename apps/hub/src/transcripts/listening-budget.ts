import { MICROS_PER_USD, localClock, zonedInstant } from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { Transcripts } from './transcript-service';

export interface ListeningBudgetOptions {
  readonly store: Pick<Store, 'live' | 'host'>;
  readonly transcripts: Pick<Transcripts, 'settings'>;
  readonly clock: Pick<Clock, 'now'>;
}

export class ListeningBudget {
  constructor(private readonly options: ListeningBudgetOptions) {}

  spentToday(): Promise<number> {
    const timeZone = this.options.store.live.home.settings.read().time_zone;
    const now = this.options.clock.now();
    const start = zonedInstant(localClock(now, timeZone), 0, timeZone);
    return this.options.store.host.call('transcripts', 'listeningSpent', start.toISOString());
  }

  async capReached(): Promise<boolean> {
    const [spent, settings] = await Promise.all([
      this.spentToday(),
      this.options.transcripts.settings(),
    ]);
    return spent >= settings.daily_cap_usd * MICROS_PER_USD;
  }
}
