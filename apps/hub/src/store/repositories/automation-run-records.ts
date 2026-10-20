import {
  ACTIVE_RUN_RECORD_STATUSES,
  AUTOMATION_RUN_RECORD,
  summaryOf,
  type AutomationRunRecord,
  type AutomationRunSummary,
  type RowOperation,
  type RunRecordStatus,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { CommandsRepository } from './commands';
import { assignments, found, moment, type StoreContext } from '../context';
import { jsonText } from '../sql';

export type RunSummaryPublisher = (
  operation: RowOperation,
  record: AutomationRunSummary,
  oldRecord: AutomationRunSummary | null,
) => void;

const STORED_RECORD = storedRow(AUTOMATION_RUN_RECORD, {
  json: ['state', 'trigger', 'cause_chain', 'waiting_on', 'plan_refs', 'active_paths'],
});
const COLUMNS = Object.keys(AUTOMATION_RUN_RECORD.shape).join(',');
const ACTIVE = [...ACTIVE_RUN_RECORD_STATUSES].map((status) => `'${status}'`).join(',');
const UNFINISHED = [...ACTIVE_RUN_RECORD_STATUSES]
  .filter((status) => status !== 'waiting')
  .map((status) => `'${status}'`)
  .join(',');
const ROW_ID = z.strictObject({ id: z.uuid() });
const COMMAND_STOPPED =
  'The hub stopped before the owned command outcome was known. It was not replayed.';
const RUN_STOPPED = 'The hub stopped before this run finished. Its actions were not replayed.';

export interface NewRunRecord {
  readonly id?: string;
  readonly automationId: string;
  readonly revision: number;
  readonly ownerProfileId: string | null;
  readonly controlKey?: string | null;
  readonly parentRunId?: string | null;
  readonly status?: 'queued' | 'running';
  readonly mode: AutomationRunRecord['mode'];
  readonly planHash: string;
  readonly planRefs?: AutomationRunRecord['plan_refs'];
  readonly trigger?: AutomationRunRecord['trigger'];
  readonly causeChain?: AutomationRunRecord['cause_chain'];
  readonly startedBy?: string | null;
}

export interface RunRecordChange {
  readonly status?: RunRecordStatus;
  readonly current_node?: string | null;
  readonly error?: string | null;
  readonly started_at?: string | null;
  readonly finished_at?: string | null;
  readonly steps?: number;
  readonly commands?: number;
  readonly iterations?: number;
  readonly active_paths?: readonly string[];
  readonly wake_at?: string | null;
  readonly state?: AutomationRunRecord['state'];
  readonly waiting_on?: AutomationRunRecord['waiting_on'];
}

export interface RunParking {
  readonly state: NonNullable<AutomationRunRecord['state']>;
  readonly wakeAt: string | null;
  readonly waitingOn: NonNullable<AutomationRunRecord['waiting_on']>;
  readonly activePaths: readonly string[];
}

function encoded(value: unknown): string | null | undefined {
  return value === undefined || value === null ? value : jsonText(value);
}

export class AutomationRunRecordsRepository {
  constructor(
    private readonly context: StoreContext,
    private readonly publish: RunSummaryPublisher,
  ) {}

  byId(id: string): AutomationRunRecord {
    return found(
      this.context.sql.get(STORED_RECORD, `select ${COLUMNS} from automation_runs where id=$id`, {
        id,
      }),
      'automation run',
      id,
    );
  }

  summaryById(id: string): AutomationRunSummary {
    return summaryOf(this.byId(id));
  }

  summaries(automationId: string | null, limit: number): AutomationRunSummary[] {
    return this.context.sql
      .all(
        STORED_RECORD,
        `select ${COLUMNS} from automation_runs where ($automationId is null or automation_id=$automationId) order by created_at desc, rowid desc limit $limit`,
        { automationId, limit },
      )
      .map(summaryOf);
  }

  summariesOf(automationIds: readonly string[], limit: number): AutomationRunSummary[] {
    return this.context.sql
      .all(
        STORED_RECORD,
        `select ${COLUMNS} from automation_runs where automation_id in (select value from json_each($ids)) order by created_at desc, rowid desc limit $limit`,
        { ids: JSON.stringify(automationIds), limit },
      )
      .map(summaryOf);
  }

  waitingDue(through: string): AutomationRunRecord[] {
    return this.context.sql.all(
      STORED_RECORD,
      `select ${COLUMNS} from automation_runs where status='waiting' and wake_at is not null and wake_at <= $through order by wake_at, rowid`,
      { through: moment(through) },
    );
  }

  waiting(): AutomationRunRecord[] {
    return this.context.sql.all(
      STORED_RECORD,
      `select ${COLUMNS} from automation_runs where status='waiting' order by created_at, rowid`,
    );
  }

  active(automationId: string): AutomationRunRecord[] {
    return this.context.sql.all(
      STORED_RECORD,
      `select ${COLUMNS} from automation_runs where automation_id=$automationId and status in (${ACTIVE}) order by created_at, rowid`,
      { automationId },
    );
  }

  create(input: NewRunRecord): AutomationRunRecord {
    return this.context.write(() => {
      const id = input.id ?? this.context.newId();
      const now = this.context.now();
      const status = input.status ?? 'queued';
      this.context.sql.run(
        'create automation run record',
        `insert into automation_runs(id,automation_id,revision,owner_profile_id,control_key,parent_run_id,status,mode,plan_hash,plan_refs,trigger,cause_chain,started_by,created_at,started_at)
         values($id,$automationId,$revision,$owner,$control,$parent,$status,$mode,$planHash,$planRefs,$trigger,$causeChain,$startedBy,$now,$startedAt)`,
        {
          id,
          automationId: input.automationId,
          revision: input.revision,
          owner: input.ownerProfileId,
          control: input.controlKey ?? null,
          parent: input.parentRunId ?? null,
          status,
          mode: input.mode,
          planHash: input.planHash,
          planRefs: jsonText(input.planRefs ?? []),
          trigger: encoded(input.trigger) ?? null,
          causeChain: jsonText(input.causeChain ?? []),
          startedBy: input.startedBy ?? null,
          now,
          startedAt: status === 'running' ? now : null,
        },
      );
      const row = this.byId(id);
      this.publish('INSERT', summaryOf(row), null);
      return row;
    });
  }

  update(id: string, change: RunRecordChange): AutomationRunRecord {
    return this.context.write(() => {
      const before = this.byId(id);
      const set = assignments({
        ...change,
        active_paths: encoded(change.active_paths),
        state: encoded(change.state),
        waiting_on: encoded(change.waiting_on),
      });
      if (set.text !== '')
        this.context.sql.run(
          'change automation run record',
          `update automation_runs set ${set.text} where id=$id`,
          { ...set.parameters, id },
        );
      const after = this.byId(id);
      this.publishTransition(after, before);
      return after;
    });
  }

  park(id: string, parking: RunParking): AutomationRunRecord {
    return this.update(id, {
      status: 'waiting',
      state: parking.state,
      wake_at: parking.wakeAt,
      waiting_on: parking.waitingOn,
      active_paths: parking.activePaths,
    });
  }

  resume(id: string): AutomationRunRecord {
    return this.update(id, { status: 'running', state: null, wake_at: null, waiting_on: null });
  }

  interruptUnfinished(): void {
    this.context.write(() => {
      const commands = this.context.sql.all(
        ROW_ID,
        "select commands.id from commands join automation_run_commands on command_id=commands.id where commands.status in ('pending','running')",
      );
      for (const command of commands)
        new CommandsRepository(this.context).finish(command.id, {
          status: 'failed',
          error: COMMAND_STOPPED,
        });
      const rows = this.context.sql.all(
        ROW_ID,
        `select id from automation_runs where status in (${UNFINISHED})`,
      );
      for (const { id } of rows)
        this.update(id, {
          status: 'interrupted',
          current_node: null,
          error: RUN_STOPPED,
          finished_at: this.context.now(),
        });
    });
  }

  forget(automationId: string): number {
    return this.context.write(() => {
      const finished = `select id from automation_runs where automation_id=$automationId and status not in (${ACTIVE})`;
      this.context.sql.run(
        'forget the commands of the runs of a removed automation',
        `delete from automation_run_commands where run_id in (${finished})`,
        { automationId },
      );
      return this.context.sql.run(
        'forget the runs of a removed automation',
        `delete from automation_runs where id in (${finished})`,
        { automationId },
      );
    });
  }

  private publishTransition(after: AutomationRunRecord, before: AutomationRunRecord): void {
    const next = summaryOf(after);
    const previous = summaryOf(before);
    if (jsonText(next) === jsonText(previous)) return;
    this.publish('UPDATE', next, previous);
  }
}
