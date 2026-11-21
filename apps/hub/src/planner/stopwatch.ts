import type { PlannerStopwatchRow } from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { StopwatchAction } from './units/clock';

export interface StopwatchServiceOptions {
  readonly store: Pick<Store, 'host'>;
  readonly clock: Pick<Clock, 'now'>;
}

export function elapsedOf(row: PlannerStopwatchRow, now: number): number {
  if (row.started_at === null) return row.accumulated_ms;
  return row.accumulated_ms + Math.max(now - Date.parse(row.started_at), 0);
}

export class StopwatchService {
  constructor(private readonly options: StopwatchServiceOptions) {}

  begin(profileId: string): Promise<PlannerStopwatchRow> {
    return this.change(profileId, 'begin');
  }

  pause(profileId: string): Promise<PlannerStopwatchRow> {
    return this.change(profileId, 'pause');
  }

  lap(profileId: string): Promise<PlannerStopwatchRow> {
    return this.change(profileId, 'lap');
  }

  reset(profileId: string): Promise<PlannerStopwatchRow> {
    return this.change(profileId, 'reset');
  }

  private change(profileId: string, action: StopwatchAction): Promise<PlannerStopwatchRow> {
    return this.options.store.host.write('plannerStopwatch', {
      profileId,
      action,
      nowMs: this.options.clock.now().getTime(),
    });
  }
}
