import { AutomationRunsRepository } from './automation-runs';
import { HarnessEffectsRepository } from './harness-effects';
import { currentExecutionAuthority } from '../../assistant/turn-authority';
import {
  AUTOMATION_ROW,
  type AutomationAuthor,
  AUTOMATION_V2,
  ApiError,
  JSON_VALUE,
  automationReferences,
  identifiedAutomationV2,
  jsonEquals,
  type AutomationRow,
  type AutomationV2,
  type PluginOrigin,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';

const STORED_AUTOMATION = storedRow(AUTOMATION_ROW, {
  flags: ['enabled'],
  json: ['definition', 'origin', 'author'],
});

const COLUMNS =
  'id, name, enabled, revision, definition, origin, author, last_run_at, last_error, run_count, created_at, updated_at';

export interface NewAutomation {
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: AutomationV2;
  readonly origin: PluginOrigin | null;
  readonly author: AutomationAuthor;
}

export type AutomationChange = {
  readonly [K in Exclude<keyof NewAutomation, 'author'>]?: NewAutomation[K] | undefined;
} & { readonly expectedRevision?: number | undefined };

export interface RunBookkeeping {
  readonly lastRunAt?: string;
  readonly runCount?: number;
  readonly lastError: string | null;
}

function movesRevision(before: AutomationRow, change: AutomationChange): boolean {
  const renamed = change.name !== undefined && change.name !== before.name;
  const toggled = change.enabled !== undefined && change.enabled !== before.enabled;
  return renamed || toggled;
}

function columnsOf(
  change: AutomationChange,
  definition: AutomationV2 | undefined,
): Readonly<Record<string, SQLInputValue>> {
  const { name, enabled, origin } = change;
  return {
    ...(name === undefined ? {} : { name }),
    ...(enabled === undefined ? {} : { enabled: flag(enabled) }),
    ...(definition === undefined ? {} : { definition: jsonText(definition) }),
    ...(origin === undefined ? {} : { origin: origin === null ? null : jsonText(origin) }),
  };
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
    return found(this.find(id), 'automation', id);
  }

  find(id: string): AutomationRow | undefined {
    return this.context.sql.get(
      STORED_AUTOMATION,
      `select ${COLUMNS} from automations where id = $id`,
      { id },
    );
  }

  create(automation: NewAutomation): AutomationRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'add the automation',
        `insert into automations (id, name, enabled, definition, origin, author, created_at, updated_at)
         values ($id, $name, $enabled, $definition, $origin, $author, $now, $now)`,
        {
          id,
          name: automation.name,
          enabled: flag(automation.enabled),
          definition: jsonText(this.identified(automation.definition, true)),
          origin: automation.origin === null ? null : jsonText(automation.origin),
          author: jsonText(automation.author),
          now,
        },
      );
      new HarnessEffectsRepository(this.context).keep(
        'automation',
        id,
        currentExecutionAuthority(),
      );
      const row = this.byId(id);
      this.context.changed('automations', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, change: AutomationChange): AutomationRow {
    return this.context.write(() => {
      const before = this.byId(id);
      if (change.expectedRevision !== undefined && change.expectedRevision !== before.revision)
        throw new ApiError(
          'conflict',
          'The automation changed since it was read. Reload it and save again.',
        );
      new HarnessEffectsRepository(this.context).keep(
        'automation',
        id,
        currentExecutionAuthority(),
      );
      return this.change(before, this.changes(before, change));
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
      this.requireUnused(before);
      new AutomationRunsRepository(this.context).forget(id);
      this.context.sql.run('remove the automation', 'delete from automations where id = $id', {
        id,
      });
      this.context.changed('automations', 'DELETE', null, before);
    });
  }

  private requireUnused(automation: AutomationRow): void {
    const user = this.list().find((row) => {
      const parsed = AUTOMATION_V2.safeParse(row.definition);
      return (
        row.id !== automation.id &&
        parsed.success &&
        automationReferences(parsed.data, automation.id)
      );
    });
    if (user !== undefined)
      throw new ApiError(
        'conflict',
        `The automation ${user.name} runs this automation. Remove that step first.`,
      );
  }

  private changes(
    before: AutomationRow,
    change: AutomationChange,
  ): Readonly<Record<string, SQLInputValue>> {
    const definition =
      change.definition === undefined ? undefined : this.identified(change.definition, false);
    const redefined =
      definition !== undefined && !jsonEquals(JSON_VALUE.parse(definition), before.definition);
    return {
      ...columnsOf(change, definition),
      ...(redefined ? { last_error: null } : {}),
      ...(redefined || movesRevision(before, change) ? { revision: before.revision + 1 } : {}),
    };
  }

  private identified(definition: AutomationV2, remap: boolean): AutomationV2 {
    return identifiedAutomationV2(definition, () => this.context.newId(), remap);
  }

  private change(
    before: AutomationRow,
    values: Readonly<Record<string, SQLInputValue>>,
  ): AutomationRow {
    const set = assignments({ ...values, updated_at: this.context.now() });
    this.context.sql.run(
      'change the automation',
      `update automations set ${set.text} where id = $id`,
      { ...set.parameters, id: before.id },
    );
    const after = this.byId(before.id);
    this.context.changed('automations', 'UPDATE', after, before);
    return after;
  }
}
