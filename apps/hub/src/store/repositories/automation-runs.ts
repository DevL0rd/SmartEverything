import type { SpeechOccurrence } from '../../transcripts/speech';
import { SpeechRepository } from './speech';
import { z } from 'zod';
import { CommandsRepository } from './commands';
import {
  ACTIVE_AUTOMATION_RUN_STATUSES,
  AUTOMATION_RUNS_KEPT,
  AUTOMATION_RUN_HISTORY_LIMIT,
  AUTOMATION_RUN_ROW,
  AUTOMATION_TRACE_KEPT,
  type AutomationRunRow,
  type AutomationRunStatus,
  type AutomationRunStep,
  type CommandRow,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { assignments, found, moment, type StoreContext } from '../context';
import { inList, jsonText } from '../sql';

const STORED_RUN = storedRow(AUTOMATION_RUN_ROW, { json: ['trace'] });
const STORED_COMMAND_RUN = storedRow(AUTOMATION_RUN_ROW.extend({ command_id: z.uuid() }), {
  json: ['trace'],
});
const COLUMNS =
  'id,automation_id,revision,owner_profile_id,control_key,parent_run_id,status,current_node,trace,error,created_at,started_at,finished_at';
const ACTIVE = "'queued','running','cancelling'";

export interface NewAutomationRun {
  readonly occurrence?: SpeechOccurrence;
  readonly automationId: string;
  readonly revision: number;
  readonly parentRunId?: string;
  readonly ownerProfileId: string | null;
  readonly controlKey?: string;
}
export interface AutomationRunChange {
  readonly status?: AutomationRunStatus;
  readonly current_node?: string | null;
  readonly trace?: readonly AutomationRunStep[];
  readonly error?: string | null;
  readonly started_at?: string | null;
  readonly finished_at?: string | null;
}

export class AutomationRunsRepository {
  constructor(private readonly context: StoreContext) {}

  list(automationId?: string): AutomationRunRow[] {
    return this.context.sql.all(
      STORED_RUN,
      `select ${COLUMNS} from automation_runs where ($automationId is null or automation_id=$automationId) order by created_at desc, rowid desc limit $limit`,
      { automationId: automationId ?? null, limit: AUTOMATION_RUN_HISTORY_LIMIT },
    );
  }

  byId(id: string): AutomationRunRow {
    return found(
      this.context.sql.get(STORED_RUN, `select ${COLUMNS} from automation_runs where id=$id`, {
        id,
      }),
      'automation run',
      id,
    );
  }

  startedBetween(from: string, to: string): AutomationRunRow[] {
    return this.context.sql.all(
      STORED_RUN,
      `select ${COLUMNS} from automation_runs where created_at >= $from and created_at < $to order by created_at, rowid`,
      { from: moment(from), to: moment(to) },
    );
  }

  runsOfCommands(commandIds: readonly string[]): ReadonlyMap<string, AutomationRunRow> {
    const owned = inList('automation_run_commands.command_id', 'commands', commandIds);
    const rows = this.context.sql.all(
      STORED_COMMAND_RUN,
      `select ${COLUMNS.split(',')
        .map((column) => `automation_runs.${column}`)
        .join(',')}, automation_run_commands.command_id
       from automation_run_commands join automation_runs on automation_runs.id = automation_run_commands.run_id
       where ${owned.text}`,
      owned.parameters,
    );
    return new Map(rows.map(({ command_id: commandId, ...run }) => [commandId, run]));
  }

  create(input: NewAutomationRun): AutomationRunRow {
    return this.context.write(() => {
      if (input.occurrence !== undefined)
        new SpeechRepository(this.context).claim(input.occurrence);
      const id = this.context.newId();
      this.context.sql.run(
        'create automation run',
        `insert into automation_runs(id,parent_run_id,automation_id,revision,owner_profile_id,control_key,status,trace,created_at) values($id,$parentRunId,$automationId,$revision,$owner,$control,'queued','[]',$now)`,
        {
          id,
          parentRunId: input.parentRunId ?? null,
          automationId: input.automationId,
          revision: input.revision,
          owner: input.ownerProfileId,
          control: input.controlKey ?? null,
          now: this.context.now(),
        },
      );
      this.trim(input.automationId);
      const row = this.byId(id);
      this.context.changed('automation_runs', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, change: AutomationRunChange): AutomationRunRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const set = assignments({
        ...change,
        trace:
          change.trace === undefined
            ? undefined
            : jsonText(change.trace.slice(-AUTOMATION_TRACE_KEPT)),
      });
      this.context.sql.run(
        'change automation run',
        `update automation_runs set ${set.text} where id=$id`,
        { ...set.parameters, id },
      );
      const after = this.byId(id);
      this.context.changed('automation_runs', 'UPDATE', after, before);
      return after;
    });
  }

  forget(automationId: string): void {
    const finished = `select id from automation_runs where automation_id=$automationId and status not in (${ACTIVE})`;
    const parameters = { automationId };
    this.context.sql.run(
      'forget the commands of the runs of a removed automation',
      `delete from automation_run_commands where run_id in (${finished})`,
      parameters,
    );
    this.context.sql.run(
      'forget the runs of a removed automation',
      `delete from automation_runs where id in (${finished})`,
      parameters,
    );
  }

  canDispatch(commandId: string): boolean {
    const run = this.context.sql.get(
      z.strictObject({ status: z.string() }),
      'select status from automation_runs join automation_run_commands on run_id=automation_runs.id where command_id=$commandId',
      { commandId },
    );
    return run === undefined || run.status === 'running';
  }

  retainCommands(runId: string, rows: readonly CommandRow[]): void {
    for (const row of rows)
      this.context.sql.run(
        'retain automation command ownership',
        'insert into automation_run_commands(run_id,command_id) values($runId,$id)',
        { runId, id: row.id },
      );
  }

  interruptUnfinished(): void {
    this.context.write(() => {
      const commands = this.context.sql.all(
        z.strictObject({ id: z.uuid() }),
        "select commands.id from commands join automation_run_commands on command_id=commands.id where commands.status in ('pending','running')",
      );
      for (const command of commands)
        new CommandsRepository(this.context).finish(command.id, {
          status: 'failed',
          error: 'The hub stopped before the owned command outcome was known. It was not replayed.',
        });
      const rows = this.context.sql.all(
        STORED_RUN,
        `select ${COLUMNS} from automation_runs where status in (${ACTIVE})`,
      );
      for (const row of rows) {
        if (ACTIVE_AUTOMATION_RUN_STATUSES.has(row.status))
          this.update(row.id, {
            status: 'interrupted',
            current_node: null,
            error: 'The hub stopped before this run finished. Its actions were not replayed.',
            finished_at: this.context.now(),
          });
      }
    });
  }

  private trim(automationId: string): void {
    const old = `select id from automation_runs where automation_id=$automationId and status not in (${ACTIVE}) order by created_at desc, rowid desc limit -1 offset $kept`;
    const parameters = { automationId, kept: AUTOMATION_RUNS_KEPT };
    this.context.sql.run(
      'forget the commands of old runs',
      `delete from automation_run_commands where run_id in (${old})`,
      parameters,
    );
    this.context.sql.run(
      'forget old runs',
      `delete from automation_runs where id in (${old})`,
      parameters,
    );
  }
}
