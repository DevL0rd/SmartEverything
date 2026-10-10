import {
  AUTOMATION_ROW,
  jsonEquals,
  type AutomationDefinition,
  type AutomationRow,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';

const STORED_AUTOMATION = storedRow(AUTOMATION_ROW, { flags: ['enabled'], json: ['definition'] });

const COLUMNS =
  'id, name, enabled, definition, last_run_at, last_error, run_count, created_at, updated_at';

export interface NewAutomation {
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: AutomationDefinition;
}

export type AutomationChange = {
  readonly [K in keyof NewAutomation]?: NewAutomation[K] | undefined;
};

export interface RunBookkeeping {
  readonly lastRunAt?: string;
  readonly runCount?: number;
  readonly lastError: string | null;
}

export class AutomationsRepository {
  constructor(private readonly context: StoreContext) {}

  list(): AutomationRow[] {
    return this.context.sql.all(
      STORED_AUTOMATION,
      `select ${COLUMNS} from automations order by name`,
    );
  }

  byId(id: string): AutomationRow {
    return found(
      this.context.sql.get(STORED_AUTOMATION, `select ${COLUMNS} from automations where id = $id`, {
        id,
      }),
      'automation',
      id,
    );
  }

  create(automation: NewAutomation): AutomationRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'add the automation',
        `insert into automations (id, name, enabled, definition, created_at, updated_at)
         values ($id, $name, $enabled, $definition, $now, $now)`,
        {
          id,
          name: automation.name,
          enabled: flag(automation.enabled),
          definition: jsonText(automation.definition),
          now,
        },
      );
      const row = this.byId(id);
      this.context.changed('automations', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, change: AutomationChange): AutomationRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const redefined =
        change.definition !== undefined && !jsonEquals(change.definition, before.definition);
      return this.change(before, {
        ...(change.name === undefined ? {} : { name: change.name }),
        ...(change.enabled === undefined ? {} : { enabled: flag(change.enabled) }),
        ...(change.definition === undefined ? {} : { definition: jsonText(change.definition) }),
        ...(redefined ? { last_error: null } : {}),
      });
    });
  }

  recordRun(id: string, run: RunBookkeeping): AutomationRow {
    return this.context.write(() =>
      this.change(this.byId(id), {
        last_error: run.lastError,
        ...(run.lastRunAt === undefined ? {} : { last_run_at: run.lastRunAt }),
        ...(run.runCount === undefined ? {} : { run_count: run.runCount }),
      }),
    );
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run('remove the automation', 'delete from automations where id = $id', {
        id,
      });
      this.context.changed('automations', 'DELETE', null, before);
    });
  }

  private change(
    before: AutomationRow,
    values: Readonly<Record<string, SQLInputValue>>,
  ): AutomationRow {
    const set = assignments({ ...values, updated_at: this.context.now() });
    this.context.sql.run(
      'change the automation',
      `update automations set ${set.text} where id = $id`,
      {
        ...set.parameters,
        id: before.id,
      },
    );
    const after = this.byId(before.id);
    this.context.changed('automations', 'UPDATE', after, before);
    return after;
  }
}
