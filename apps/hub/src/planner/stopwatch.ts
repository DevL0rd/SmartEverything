import { ApiError, type PlannerLap, type PlannerStopwatchRow } from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { Store } from '../store/store';

export interface StopwatchServiceOptions {
  readonly store: Store;
  readonly clock: Clock;
}

export function elapsedOf(row: PlannerStopwatchRow, now: number): number {
  if (row.started_at === null) return row.accumulated_ms;
  return row.accumulated_ms + Math.max(now - Date.parse(row.started_at), 0);
}

export class StopwatchService {
  constructor(private readonly options: StopwatchServiceOptions) {}

  read(profileId: string): PlannerStopwatchRow {
    return (
      this.options.store.plannerStopwatch.find(profileId) ??
      this.options.store.plannerStopwatch.insert({
        profile_id: profileId,
        running: false,
        started_at: null,
        accumulated_ms: 0,
        laps: [],
      })
    );
  }

  begin(profileId: string): PlannerStopwatchRow {
    const row = this.read(profileId);
    if (row.running) return row;
    return this.options.store.plannerStopwatch.update(profileId, {
      running: true,
      started_at: this.options.clock.now().toISOString(),
    });
  }

  pause(profileId: string): PlannerStopwatchRow {
    const row = this.read(profileId);
    if (!row.running) return row;
    return this.options.store.plannerStopwatch.update(profileId, {
      running: false,
      started_at: null,
      accumulated_ms: elapsedOf(row, this.options.clock.now().getTime()),
    });
  }

  lap(profileId: string): PlannerStopwatchRow {
    const row = this.read(profileId);
    if (!row.running) throw new ApiError('conflict', 'Start the stopwatch before a lap.');
    const elapsed = elapsedOf(row, this.options.clock.now().getTime());
    const previous = row.laps.at(-1)?.elapsed_ms ?? 0;
    const lap: PlannerLap = { elapsed_ms: elapsed, split_ms: elapsed - previous };
    return this.options.store.plannerStopwatch.update(profileId, { laps: [...row.laps, lap] });
  }

  reset(profileId: string): PlannerStopwatchRow {
    this.read(profileId);
    return this.options.store.plannerStopwatch.update(profileId, {
      running: false,
      started_at: null,
      accumulated_ms: 0,
      laps: [],
    });
  }
}
