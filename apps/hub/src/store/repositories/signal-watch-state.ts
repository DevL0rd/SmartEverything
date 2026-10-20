import { z } from 'zod';
import type { StoreContext } from '../context';
import { SQL_FLAG } from '../sql';

const STORED_STATE = z.object({
  last_seen_ms: z.number().int().nullable(),
  period: z.string().nullable(),
  latched: SQL_FLAG,
});

const STORED_TRIGGER = z.object({ automation_id: z.string(), trigger_id: z.string() });

export interface WatchKey {
  readonly automationId: string;
  readonly triggerId: string;
  readonly partition: string;
}

export interface WatchState {
  readonly lastSeenMs: number | null;
  readonly period: string | null;
  readonly latched: boolean;
}

export interface WatchTrigger {
  readonly automationId: string;
  readonly triggerId: string;
}

export class SignalWatchStateRepository {
  constructor(private readonly context: StoreContext) {}

  load(key: WatchKey): WatchState | null {
    const row = this.context.sql.get(
      STORED_STATE,
      `select last_seen_ms, period, latched from signal_watch_state
       where automation_id = $automationId and trigger_id = $triggerId and partition = $partition`,
      { ...key },
    );
    return row === undefined
      ? null
      : { lastSeenMs: row.last_seen_ms, period: row.period, latched: row.latched };
  }

  save(key: WatchKey, state: WatchState): void {
    this.context.sql.run(
      'keep the signal watch state',
      `insert into signal_watch_state (automation_id, trigger_id, partition, last_seen_ms, period, latched)
       values ($automationId, $triggerId, $partition, $lastSeenMs, $period, $latched)
       on conflict (automation_id, trigger_id, partition) do update set
         last_seen_ms = excluded.last_seen_ms, period = excluded.period, latched = excluded.latched`,
      {
        ...key,
        lastSeenMs: state.lastSeenMs,
        period: state.period,
        latched: state.latched ? 1 : 0,
      },
    );
  }

  retain(triggers: readonly WatchTrigger[]): void {
    this.context.write(() => {
      const keep = new Set(
        triggers.map((trigger) => `${trigger.automationId}|${trigger.triggerId}`),
      );
      const stored = this.context.sql.all(
        STORED_TRIGGER,
        'select distinct automation_id, trigger_id from signal_watch_state',
      );
      for (const row of stored) {
        if (!keep.has(`${row.automation_id}|${row.trigger_id}`)) {
          this.context.sql.run(
            'drop the signal watch state of a trigger that is gone',
            'delete from signal_watch_state where automation_id = $automationId and trigger_id = $triggerId',
            { automationId: row.automation_id, triggerId: row.trigger_id },
          );
        }
      }
    });
  }

  forget(automationId: string): void {
    this.context.sql.run(
      'drop the signal watch state of the automation',
      'delete from signal_watch_state where automation_id = $automationId',
      { automationId },
    );
  }
}
