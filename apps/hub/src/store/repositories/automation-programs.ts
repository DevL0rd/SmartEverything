import {
  AUTOMATION_ROW,
  ApiError,
  type AutomationAuthor,
  type StoredAutomationRow,
  type AutomationV4,
  type Layout,
  type NodeKindLookup,
  type PluginOrigin,
} from '@smarteverything/domain';
import { completeLayout } from '@smarteverything/flow/graph/place-new';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';
import { AutomationRevisionsRepository } from './automation-revisions';
import { SignalWatchStateRepository } from './signal-watch-state';

const STORED_PROGRAM = storedRow(AUTOMATION_ROW, {
  flags: ['enabled'],
  json: ['definition', 'draft', 'layout', 'origin', 'author'],
});

const COLUMNS =
  'id, name, enabled, revision, definition, draft, layout, origin, author, last_run_at, last_error, run_count, created_at, updated_at';

export interface NewAutomationProgram {
  readonly name: string;
  readonly enabled: boolean;
  readonly program: AutomationV4;
  readonly layout: Layout;
  readonly planHash: string;
  readonly origin: PluginOrigin | null;
  readonly author: AutomationAuthor | null;
}

export interface ProgramDraft {
  readonly program: AutomationV4;
  readonly layout: Layout;
}

export interface ProgramReplacement extends ProgramDraft {
  readonly expectedRevision: number;
  readonly planHash: string;
  readonly author: AutomationAuthor | null;
}

export interface ProgramPublication {
  readonly expectedRevision: number;
  readonly planHash: string;
  readonly author: AutomationAuthor | null;
}

export interface RunBookkeeping {
  readonly lastRunAt: string;
  readonly lastError: string | null;
}

function stale(): ApiError {
  return new ApiError(
    'conflict',
    'The automation changed since it was read. Reload it and save again.',
  );
}

export class AutomationProgramsRepository {
  private readonly revisions: AutomationRevisionsRepository;

  constructor(private readonly context: StoreContext) {
    this.revisions = new AutomationRevisionsRepository(context);
  }

  list(): StoredAutomationRow[] {
    return this.context.sql.all(STORED_PROGRAM, `select ${COLUMNS} from automations order by name`);
  }

  byId(id: string): StoredAutomationRow {
    return found(this.find(id), 'automation', id);
  }

  find(id: string): StoredAutomationRow | undefined {
    return this.context.sql.get(
      STORED_PROGRAM,
      `select ${COLUMNS} from automations where id = $id`,
      { id },
    );
  }

  findByName(name: string): StoredAutomationRow | undefined {
    return this.context.sql.get(
      STORED_PROGRAM,
      `select ${COLUMNS} from automations where name = $name`,
      { name },
    );
  }

  create(automation: NewAutomationProgram, kinds: NodeKindLookup): StoredAutomationRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      const layout = completeLayout(automation.program, automation.layout, {
        kinds,
        direction: 'ltr',
      });
      this.context.sql.run(
        'add the automation',
        `insert into automations (id, name, enabled, definition, layout, origin, author, created_at, updated_at)
         values ($id, $name, $enabled, $definition, $layout, $origin, $author, $now, $now)`,
        {
          id,
          name: automation.name,
          enabled: flag(automation.enabled),
          definition: jsonText(automation.program),
          layout: jsonText(layout),
          origin: automation.origin === null ? null : jsonText(automation.origin),
          author: automation.author === null ? null : jsonText(automation.author),
          now,
        },
      );
      this.revisions.insert({
        automationId: id,
        revision: 1,
        definition: automation.program,
        layout,
        planHash: automation.planHash,
        author: automation.author,
      });
      const row = this.byId(id);
      this.context.changed('automations', 'INSERT', row, null);
      return row;
    });
  }

  saveDraft(
    id: string,
    draft: ProgramDraft,
    expectedRevision: number,
    kinds: NodeKindLookup,
  ): StoredAutomationRow {
    return this.context.write(() => {
      const before = this.expect(id, expectedRevision);
      const completed = {
        ...draft,
        layout: completeLayout(draft.program, draft.layout, { kinds, direction: 'ltr' }),
      };
      this.context.sql.run(
        'save the automation draft',
        'update automations set draft = $draft, updated_at = $now where id = $id',
        { id, draft: jsonText(completed), now: this.context.now() },
      );
      return this.updated(before);
    });
  }

  discardDraft(id: string, expectedRevision: number): StoredAutomationRow {
    return this.context.write(() => {
      const before = this.expect(id, expectedRevision);
      this.context.sql.run(
        'discard the automation draft',
        'update automations set draft = null, updated_at = $now where id = $id',
        { id, now: this.context.now() },
      );
      return this.updated(before);
    });
  }

  saveLayout(
    id: string,
    layout: Layout,
    expectedRevision: number,
    kinds: NodeKindLookup,
  ): StoredAutomationRow {
    return this.context.write(() => {
      const before = this.expect(id, expectedRevision);
      const completed = completeLayout(before.definition, layout, { kinds, direction: 'ltr' });
      this.context.sql.run(
        'save the automation layout',
        'update automations set layout = $layout, updated_at = $now where id = $id',
        { id, layout: jsonText(completed), now: this.context.now() },
      );
      return this.updated(before);
    });
  }

  replace(id: string, change: ProgramReplacement, kinds: NodeKindLookup): StoredAutomationRow {
    return this.context.write(() => {
      const before = this.expect(id, change.expectedRevision);
      const layout = completeLayout(change.program, change.layout, { kinds, direction: 'ltr' });
      return this.promote(before, { ...change, layout }, before.draft);
    });
  }

  publish(id: string, publication: ProgramPublication): StoredAutomationRow {
    return this.context.write(() => {
      const before = this.expect(id, publication.expectedRevision);
      if (before.draft === null)
        throw new ApiError('conflict', 'The automation has no draft to publish.');
      return this.promote(before, { ...before.draft, ...publication }, null);
    });
  }

  setEnabled(id: string, enabled: boolean): StoredAutomationRow {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'switch the automation on or off',
        'update automations set enabled = $enabled, updated_at = $now where id = $id',
        { id, enabled: flag(enabled), now: this.context.now() },
      );
      return this.updated(before);
    });
  }

  rename(id: string, name: string): StoredAutomationRow {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'rename the automation',
        'update automations set name = $name, updated_at = $now where id = $id',
        { id, name, now: this.context.now() },
      );
      return this.updated(before);
    });
  }

  recordRun(id: string, run: RunBookkeeping): StoredAutomationRow {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'record the latest run of the automation',
        'update automations set last_run_at = $lastRunAt, last_error = $lastError, run_count = run_count + 1 where id = $id',
        { id, lastRunAt: run.lastRunAt, lastError: run.lastError },
      );
      return this.updated(before);
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      new SignalWatchStateRepository(this.context).forget(id);
      this.context.sql.run('remove the automation', 'delete from automations where id = $id', {
        id,
      });
      this.context.changed('automations', 'DELETE', null, before);
    });
  }

  private updated(before: StoredAutomationRow): StoredAutomationRow {
    const after = this.byId(before.id);
    this.context.changed('automations', 'UPDATE', after, before);
    return after;
  }

  private expect(id: string, expectedRevision: number): StoredAutomationRow {
    const row = this.byId(id);
    if (row.revision !== expectedRevision) throw stale();
    return row;
  }

  private promote(
    before: StoredAutomationRow,
    change: ProgramReplacement,
    draft: StoredAutomationRow['draft'],
  ): StoredAutomationRow {
    const revision = before.revision + 1;
    this.context.sql.run(
      'publish the automation revision',
      `update automations
       set definition = $definition, layout = $layout, draft = $draft, revision = $revision,
           last_error = null, updated_at = $now
       where id = $id`,
      {
        id: before.id,
        definition: jsonText(change.program),
        layout: jsonText(change.layout),
        draft: draft === null ? null : jsonText(draft),
        revision,
        now: this.context.now(),
      },
    );
    this.revisions.insert({
      automationId: before.id,
      revision,
      definition: change.program,
      layout: change.layout,
      planHash: change.planHash,
      author: change.author,
    });
    return this.updated(before);
  }
}
