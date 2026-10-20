import {
  AUTOMATION_RUN_RECORD,
  summaryOf,
  type AutomationRunSummary,
  type CommandRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { moment, type StoreContext } from '../context';
import { inList } from '../sql';

const STORED_RECORD = storedRow(AUTOMATION_RUN_RECORD, {
  json: ['state', 'trigger', 'cause_chain', 'waiting_on', 'plan_refs', 'active_paths'],
});
const STORED_COMMAND_RECORD = storedRow(AUTOMATION_RUN_RECORD.extend({ command_id: z.uuid() }), {
  json: ['state', 'trigger', 'cause_chain', 'waiting_on', 'plan_refs', 'active_paths'],
});
const COLUMNS = Object.keys(AUTOMATION_RUN_RECORD.shape);
const RUNNING = z.strictObject({ status: z.string() });

export class AutomationRunsRepository {
  constructor(private readonly context: StoreContext) {}

  startedBetween(from: string, to: string): AutomationRunSummary[] {
    return this.context.sql
      .all(
        STORED_RECORD,
        `select ${COLUMNS.join(',')} from automation_runs where created_at >= $from and created_at < $to order by created_at, rowid`,
        { from: moment(from), to: moment(to) },
      )
      .map(summaryOf);
  }

  runsOfCommands(commandIds: readonly string[]): ReadonlyMap<string, AutomationRunSummary> {
    const owned = inList('automation_run_commands.command_id', 'commands', commandIds);
    const rows = this.context.sql.all(
      STORED_COMMAND_RECORD,
      `select ${COLUMNS.map((column) => `automation_runs.${column}`).join(',')}, automation_run_commands.command_id
       from automation_run_commands join automation_runs on automation_runs.id = automation_run_commands.run_id
       where ${owned.text}`,
      owned.parameters,
    );
    return new Map(rows.map(({ command_id: commandId, ...run }) => [commandId, summaryOf(run)]));
  }

  canDispatch(commandId: string): boolean {
    const run = this.context.sql.get(
      RUNNING,
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
}
