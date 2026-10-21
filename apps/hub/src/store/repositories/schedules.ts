import {
  SCHEDULE_ROW,
  type PluginOrigin,
  type ScheduleResult,
  type ScheduleRow,
  type ScheduleState,
  type ScheduleStep,
  type ScheduleTiming,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const JSON_COLUMNS = [
  'timing',
  'occurrences',
  'steps',
  'step_lines',
  'device_ids',
  'results',
  'origin',
];

const STORED_SCHEDULE = storedRow(SCHEDULE_ROW, { json: JSON_COLUMNS });

const COLUMNS =
  'id, profile_id, client_id, via, label, timing, occurrences, steps, step_lines, device_ids, ' +
  'state, next_at, occurrence, step, results, confirmed_at, confirmed_by, origin, created_at, ' +
  'updated_at, finished_at';

const SQL_NO_LIMIT = -1;

const ORDER =
  'order by case when next_at is null then 1 else 0 end, next_at, ' +
  'coalesce(finished_at, updated_at) desc';

const NEXT = z.strictObject({ next: z.string().nullable() });

const WAITING_STATES = "('scheduled', 'waiting')";

export interface ScheduleFilter {
  readonly deviceId?: string | undefined;
  readonly state?: ScheduleState | undefined;
  readonly limit?: number | undefined;
}

export interface NewSchedule {
  readonly profileId: string;
  readonly clientId: string | null;
  readonly via: ScheduleRow['via'];
  readonly label: string | null;
  readonly timing: ScheduleTiming;
  readonly occurrences: readonly string[];
  readonly steps: readonly ScheduleStep[];
  readonly stepLines: readonly (string | null)[];
  readonly deviceIds: readonly string[];
  readonly origin: PluginOrigin | null;
}

export interface ScheduleChange {
  readonly label?: string | null;
  readonly timing?: ScheduleTiming;
  readonly occurrences?: readonly string[];
  readonly steps?: readonly ScheduleStep[];
  readonly stepLines?: readonly (string | null)[];
  readonly deviceIds?: readonly string[];
  readonly state?: ScheduleState;
  readonly nextAt?: string | null;
  readonly occurrence?: number;
  readonly step?: number;
  readonly results?: readonly ScheduleResult[];
  readonly origin?: PluginOrigin | null;
  readonly finishedAt?: string | null;
}

function json(value: unknown): string | undefined {
  return value === undefined ? undefined : jsonText(value);
}

function originText(origin: PluginOrigin | null): string | null {
  return origin === null ? null : jsonText(origin);
}

function columnsOf(change: ScheduleChange): Readonly<Record<string, SQLInputValue | undefined>> {
  return {
    label: change.label,
    timing: json(change.timing),
    occurrences: json(change.occurrences),
    steps: json(change.steps),
    step_lines: json(change.stepLines),
    device_ids: json(change.deviceIds),
    state: change.state,
    next_at: change.nextAt,
    occurrence: change.occurrence,
    step: change.step,
    results: json(change.results),
    origin: change.origin === undefined ? undefined : originText(change.origin),
    finished_at: change.finishedAt,
  };
}

export class SchedulesRepository {
  constructor(private readonly context: StoreContext) {}

  list(filter: ScheduleFilter = {}): ScheduleRow[] {
    return this.context.sql.all(
      STORED_SCHEDULE,
      `select ${COLUMNS} from scheduled_actions
       where ($state is null or state = $state)
         and ($deviceId is null or exists (select 1 from json_each(device_ids) where value = $deviceId))
       ${ORDER}
       limit $limit`,
      {
        state: filter.state ?? null,
        deviceId: filter.deviceId ?? null,
        limit: filter.limit ?? SQL_NO_LIMIT,
      },
    );
  }

  byId(id: string): ScheduleRow {
    return found(
      this.context.sql.get(
        STORED_SCHEDULE,
        `select ${COLUMNS} from scheduled_actions where id = $id`,
        { id },
      ),
      'scheduled action',
      id,
    );
  }

  nextDueAt(): string | null {
    return (
      this.context.sql.get(
        NEXT,
        `select min(next_at) as next from scheduled_actions
         where next_at is not null and state in ${WAITING_STATES}`,
      )?.next ?? null
    );
  }

  due(now: string): ScheduleRow[] {
    return this.context.sql.all(
      STORED_SCHEDULE,
      `select ${COLUMNS} from scheduled_actions
       where next_at is not null and next_at <= $now and state in ${WAITING_STATES}
       order by next_at`,
      { now },
    );
  }

  interrupted(): ScheduleRow[] {
    return this.context.sql.all(
      STORED_SCHEDULE,
      `select ${COLUMNS} from scheduled_actions where state = 'running' order by next_at`,
    );
  }

  create(schedule: NewSchedule): ScheduleRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'add the scheduled action',
        `insert into scheduled_actions (id, profile_id, client_id, via, label, timing, occurrences,
           steps, step_lines, device_ids, state, next_at, origin,
           created_at, updated_at)
         values ($id, $profileId, $clientId, $via, $label, $timing, $occurrences, $steps,
           $stepLines, $deviceIds, 'scheduled', $nextAt, $origin,
           $now, $now)`,
        {
          id,
          profileId: schedule.profileId,
          clientId: schedule.clientId,
          via: schedule.via,
          label: schedule.label,
          timing: jsonText(schedule.timing),
          occurrences: jsonText(schedule.occurrences),
          steps: jsonText(schedule.steps),
          stepLines: jsonText(schedule.stepLines),
          deviceIds: jsonText(schedule.deviceIds),
          nextAt: schedule.occurrences[0] ?? null,
          origin: originText(schedule.origin),
          now,
        },
      );
      const row = this.byId(id);
      this.context.changed('scheduled_actions', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, change: ScheduleChange): ScheduleRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const set = assignments({ ...columnsOf(change), updated_at: this.context.now() });
      this.context.sql.run(
        'change the scheduled action',
        `update scheduled_actions set ${set.text} where id = $id`,
        { ...set.parameters, id },
      );
      const after = this.byId(id);
      this.context.changed('scheduled_actions', 'UPDATE', after, before);
      return after;
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'remove the scheduled action',
        'delete from scheduled_actions where id = $id',
        { id },
      );
      this.context.changed('scheduled_actions', 'DELETE', null, before);
    });
  }

  purgeFinished(before: string): number {
    return this.context.write(() => {
      const old = this.context.sql.all(
        STORED_SCHEDULE,
        `select ${COLUMNS} from scheduled_actions where finished_at is not null and finished_at < $before`,
        { before },
      );
      for (const row of old) {
        this.remove(row.id);
      }
      return old.length;
    });
  }
}
