import type { SpeechOccurrence } from '../../transcripts/speech';
import { SpeechRepository } from './speech';
import { z } from 'zod';
import { CommandsRepository } from './commands';
import {
  ACTIVE_AUTOMATION_RUN_STATUSES,
  AUTOMATION_RUN_HISTORY_LIMIT,
  AUTOMATION_RUN_ROW,
  MAX_AUTOMATION_TRACE,
  usesStructuredActions,
  type AutomationDefinition,
  type AutomationSequenceDefinition,
  type CommandAction,
  type AutomationRunRow,
  type AutomationRunStatus,
  type AutomationRunStep,
  type CommandRow,
  type AutomationSequenceRow,
  type JsonValue,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_RUN = storedRow(AUTOMATION_RUN_ROW, { json: ['trace', 'authority_ids'] });
const COLUMNS =
  'id,target_type,automation_id,definition_revision,owner_profile_id,authority_ids,control_key,parent_run_id,status,current_node,trace,error,created_at,started_at,finished_at';
export interface NewAutomationRun {
  readonly occurrence?: SpeechOccurrence;
  readonly automationId: string;
  readonly revision: string;
  readonly definition: AutomationDefinition | AutomationSequenceDefinition;
  readonly ordered?: boolean;
  readonly targetType?: 'automation' | 'sequence';
  readonly parentRunId?: string;
  readonly sequences?: ReadonlyMap<string, AutomationSequenceRow>;
  readonly parameters?: Readonly<Record<string, JsonValue>>;
  readonly ownerProfileId: string | null;
  readonly authorityIds: readonly string[];
  readonly references: Readonly<Record<string, readonly CommandAction[]>>;
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

  list(automationId?: string, targetType?: 'automation' | 'sequence'): AutomationRunRow[] {
    return this.context.sql.all(
      STORED_RUN,
      `select ${COLUMNS} from automation_runs where ($automationId is null or automation_id=$automationId) and ($targetType is null or target_type=$targetType) order by created_at desc, rowid desc limit $limit`,
      {
        automationId: automationId ?? null,
        targetType: targetType ?? null,
        limit: AUTOMATION_RUN_HISTORY_LIMIT,
      },
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

  create(input: NewAutomationRun): AutomationRunRow {
    return this.context.write(() => {
      if (input.occurrence !== undefined)
        new SpeechRepository(this.context).claim(input.occurrence);
      const id = this.context.newId();
      this.context.sql.run(
        'create automation run',
        `insert into automation_runs(id,ordered,target_type,parent_run_id,automation_id,definition_revision,definition,reference_snapshot,sequence_snapshot,parameter_snapshot,owner_profile_id,authority_ids,control_key,status,trace,created_at) values($id,$ordered,$targetType,$parentRunId,$automationId,$revision,$definition,$references,$sequences,$parameters,$owner,$authorities,$control,'queued','[]',$now)`,
        {
          id,
          ordered: orderedRun(input) ? 1 : 0,
          targetType: input.targetType ?? 'automation',
          parentRunId: input.parentRunId ?? null,
          automationId: input.automationId,
          revision: input.revision,
          definition: jsonText(input.definition),
          references: jsonText(input.references),
          sequences: jsonText(Object.fromEntries(input.sequences ?? [])),
          parameters: jsonText(input.parameters ?? {}),
          owner: input.ownerProfileId,
          authorities: jsonText(input.authorityIds),
          control: input.definition.controlKey ?? null,
          now: this.context.now(),
        },
      );
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
            : jsonText(change.trace.slice(-MAX_AUTOMATION_TRACE)),
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

  canDispatch(commandId: string): boolean {
    const run = this.context.sql.get(
      z.strictObject({ status: z.string(), ordered: z.int().min(0).max(1) }),
      'select status,ordered from automation_runs join automation_run_commands on run_id=automation_runs.id where command_id=$commandId',
      { commandId },
    );
    if (run === undefined || run.status === 'running') return true;
    return run.ordered === 0 && (run.status === 'succeeded' || run.status === 'failed');
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
        `select ${COLUMNS} from automation_runs where status in ('queued','running','cancelling')`,
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
}

function orderedRun(input: NewAutomationRun): boolean {
  return (
    input.ordered === true ||
    input.targetType === 'sequence' ||
    input.definition.runPolicy !== undefined ||
    usesStructuredActions(input.definition.actions)
  );
}
