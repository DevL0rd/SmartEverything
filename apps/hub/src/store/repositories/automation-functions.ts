import { z } from 'zod';
import {
  ApiError,
  FUNCTION_REVISION_ROW,
  FUNCTION_ROW,
  type AutomationAuthor,
  type FunctionRevisionRow,
  type FunctionRow,
  type FunctionV3,
  type Layout,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_FUNCTION = storedRow(FUNCTION_ROW, { json: ['author', 'draft'] });
const STORED_REVISION = storedRow(FUNCTION_REVISION_ROW, {
  json: ['definition', 'layout', 'author'],
});

const FUNCTION_COLUMNS =
  'id, name, description, category, icon, latest_revision, created_by, author, created_at, updated_at, draft';
const REVISION_COLUMNS =
  'function_id, revision, definition, layout, interface_hash, compat, plan_hash, saved_at, author';

const CALL = `((t.key = 'function' and t.path like '%.ports.fn.lit') or (t.key = 'lit' and t.path like '%.ports.fn'))`;

const USER = z.strictObject({ id: z.string(), name: z.string() });

type FunctionUser = z.infer<typeof USER>;

export interface FunctionUsers {
  readonly automations: FunctionUser[];
  readonly functions: FunctionUser[];
}

export interface FunctionDraft {
  readonly program: FunctionV3;
  readonly layout: Layout;
}

export interface FunctionRevisionInput extends FunctionDraft {
  readonly interfaceHash: string;
  readonly compat: 'compatible' | 'breaking';
  readonly planHash: string;
  readonly author: AutomationAuthor | null;
}

export interface NewFunction extends FunctionRevisionInput {
  readonly id?: string;
  readonly name: string;
  readonly createdBy: string | null;
}

export interface FunctionRevisionChange extends FunctionRevisionInput {
  readonly expectedRevision: number;
}

export interface FunctionPublication {
  readonly expectedRevision: number;
  readonly interfaceHash: string;
  readonly compat: 'compatible' | 'breaking';
  readonly planHash: string;
  readonly author: AutomationAuthor | null;
}

function stale(): ApiError {
  return new ApiError(
    'conflict',
    'The Custom Node changed since it was read. Reload it and save again.',
  );
}

export class AutomationFunctionsRepository {
  constructor(private readonly context: StoreContext) {}

  list(): FunctionRow[] {
    return this.context.sql.all(
      STORED_FUNCTION,
      `select ${FUNCTION_COLUMNS} from automation_functions order by name`,
    );
  }

  byId(id: string): FunctionRow {
    return found(this.find(id), 'Custom Node', id);
  }

  find(id: string): FunctionRow | undefined {
    return this.context.sql.get(
      STORED_FUNCTION,
      `select ${FUNCTION_COLUMNS} from automation_functions where id = $id`,
      { id },
    );
  }

  create(input: NewFunction): FunctionRow {
    return this.context.write(() => {
      const id = input.id ?? this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'add the Custom Node',
        `insert into automation_functions
           (id, name, description, category, icon, latest_revision, created_by, author, created_at, updated_at)
         values ($id, $name, $description, $category, $icon, 1, $createdBy, $author, $now, $now)`,
        {
          id,
          name: input.name,
          description: input.program.description ?? null,
          category: input.program.category ?? null,
          icon: input.program.icon ?? null,
          createdBy: input.createdBy,
          author: input.author === null ? null : jsonText(input.author),
          now,
        },
      );
      this.insertRevision(id, 1, input);
      return this.byId(id);
    });
  }

  revise(id: string, change: FunctionRevisionChange): FunctionRow {
    return this.context.write(() => {
      const before = this.expect(id, change.expectedRevision);
      return this.promote(before, change, before.draft);
    });
  }

  publish(id: string, publication: FunctionPublication): FunctionRow {
    return this.context.write(() => {
      const before = this.expect(id, publication.expectedRevision);
      if (before.draft === null)
        throw new ApiError('conflict', 'The Custom Node has no draft to publish.');
      return this.promote(before, { ...before.draft, ...publication }, null);
    });
  }

  saveDraft(id: string, draft: FunctionDraft, expectedRevision: number): FunctionRow {
    return this.context.write(() => {
      this.expect(id, expectedRevision);
      this.context.sql.run(
        'save the Custom Node draft',
        'update automation_functions set draft = $draft, updated_at = $now where id = $id',
        { id, draft: jsonText(draft), now: this.context.now() },
      );
      return this.byId(id);
    });
  }

  discardDraft(id: string, expectedRevision: number): FunctionRow {
    return this.context.write(() => {
      this.expect(id, expectedRevision);
      this.context.sql.run(
        'discard the Custom Node draft',
        'update automation_functions set draft = null, updated_at = $now where id = $id',
        { id, now: this.context.now() },
      );
      return this.byId(id);
    });
  }

  rename(id: string, name: string): FunctionRow {
    return this.context.write(() => {
      this.byId(id);
      this.context.sql.run(
        'rename the Custom Node',
        'update automation_functions set name = $name, updated_at = $now where id = $id',
        { id, name, now: this.context.now() },
      );
      return this.byId(id);
    });
  }

  revision(functionId: string, revision: number): FunctionRevisionRow {
    return found(
      this.findRevision(functionId, revision),
      'Custom Node revision',
      `${functionId}@${String(revision)}`,
    );
  }

  findRevision(functionId: string, revision: number): FunctionRevisionRow | undefined {
    return this.context.sql.get(
      STORED_REVISION,
      `select ${REVISION_COLUMNS} from automation_function_revisions
       where function_id = $functionId and revision = $revision`,
      { functionId, revision },
    );
  }

  revisions(functionId: string): FunctionRevisionRow[] {
    return this.context.sql.all(
      STORED_REVISION,
      `select ${REVISION_COLUMNS} from automation_function_revisions
       where function_id = $functionId order by revision desc`,
      { functionId },
    );
  }

  latest(functionId: string): FunctionRevisionRow {
    return this.revision(functionId, this.byId(functionId).latest_revision);
  }

  followed(functionId: string, from: number): FunctionRevisionRow {
    const latest = this.byId(functionId).latest_revision;
    let reached = from;
    while (reached < latest) {
      const next = this.revision(functionId, reached + 1);
      if (next.compat === 'breaking') break;
      reached = next.revision;
    }
    return this.revision(functionId, reached);
  }

  users(functionId: string): FunctionUsers {
    const parameters = { functionId };
    return {
      automations: this.context.sql.all(
        USER,
        `select distinct a.id as id, a.name as name
         from automations a, json_tree(a.definition) t
         where t.atom = $functionId and ${CALL}
         union
         select distinct a.id as id, a.name as name
         from automations a, json_tree(a.draft) t
         where t.atom = $functionId and ${CALL}
         order by name`,
        parameters,
      ),
      functions: this.context.sql.all(
        USER,
        `select distinct f.id as id, f.name as name
         from automation_functions f
         join automation_function_revisions r
           on r.function_id = f.id and r.revision = f.latest_revision,
         json_tree(r.definition) t
         where f.id <> $functionId and t.atom = $functionId and ${CALL}
         union
         select distinct f.id as id, f.name as name
         from automation_functions f, json_tree(f.draft) t
         where f.id <> $functionId and t.atom = $functionId and ${CALL}
         order by name`,
        parameters,
      ),
    };
  }

  remove(id: string): void {
    this.context.write(() => {
      this.byId(id);
      const { automations, functions } = this.users(id);
      const user = automations[0] ?? functions[0];
      if (user !== undefined)
        throw new ApiError(
          'conflict',
          `${user.name} uses this Custom Node. Remove it there first.`,
        );
      this.context.sql.run(
        'remove the Custom Node',
        'delete from automation_functions where id = $id',
        { id },
      );
    });
  }

  private expect(id: string, expectedRevision: number): FunctionRow {
    const row = this.byId(id);
    if (row.latest_revision !== expectedRevision) throw stale();
    return row;
  }

  private promote(
    before: FunctionRow,
    change: FunctionRevisionInput,
    draft: FunctionRow['draft'],
  ): FunctionRow {
    const revision = before.latest_revision + 1;
    this.context.sql.run(
      'publish the Custom Node revision',
      `update automation_functions
       set description = $description, category = $category, icon = $icon,
           latest_revision = $revision, draft = $draft, updated_at = $now
       where id = $id`,
      {
        id: before.id,
        description: change.program.description ?? null,
        category: change.program.category ?? null,
        icon: change.program.icon ?? null,
        revision,
        draft: draft === null ? null : jsonText(draft),
        now: this.context.now(),
      },
    );
    this.insertRevision(before.id, revision, change);
    return this.byId(before.id);
  }

  private insertRevision(id: string, revision: number, input: FunctionRevisionInput): void {
    this.context.sql.run(
      'keep the Custom Node revision',
      `insert into automation_function_revisions
         (function_id, revision, definition, layout, interface_hash, compat, plan_hash, saved_at, author)
       values ($id, $revision, $definition, $layout, $interfaceHash, $compat, $planHash, $now, $author)`,
      {
        id,
        revision,
        definition: jsonText(input.program),
        layout: jsonText(input.layout),
        interfaceHash: input.interfaceHash,
        compat: input.compat,
        planHash: input.planHash,
        now: this.context.now(),
        author: input.author === null ? null : jsonText(input.author),
      },
    );
  }
}
