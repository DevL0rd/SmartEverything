import {
  AUTOMATION_REVISION_ROW,
  type AutomationAuthor,
  type AutomationRevisionRow,
  type AutomationV3,
  type Layout,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_REVISION = storedRow(AUTOMATION_REVISION_ROW, {
  json: ['definition', 'layout', 'author'],
});

const COLUMNS = 'automation_id, revision, definition, layout, plan_hash, saved_at, author';

export interface NewAutomationRevision {
  readonly automationId: string;
  readonly revision: number;
  readonly definition: AutomationV3;
  readonly layout: Layout;
  readonly planHash: string;
  readonly author: AutomationAuthor | null;
}

export class AutomationRevisionsRepository {
  constructor(private readonly context: StoreContext) {}

  insert(revision: NewAutomationRevision): AutomationRevisionRow {
    this.context.sql.run(
      'keep the automation revision',
      `insert into automation_revisions (automation_id, revision, definition, layout, plan_hash, saved_at, author)
       values ($automationId, $revision, $definition, $layout, $planHash, $savedAt, $author)`,
      {
        automationId: revision.automationId,
        revision: revision.revision,
        definition: jsonText(revision.definition),
        layout: jsonText(revision.layout),
        planHash: revision.planHash,
        savedAt: this.context.now(),
        author: revision.author === null ? null : jsonText(revision.author),
      },
    );
    return this.byRevision(revision.automationId, revision.revision);
  }

  byRevision(automationId: string, revision: number): AutomationRevisionRow {
    return found(
      this.find(automationId, revision),
      'automation revision',
      `${automationId}@${String(revision)}`,
    );
  }

  find(automationId: string, revision: number): AutomationRevisionRow | undefined {
    return this.context.sql.get(
      STORED_REVISION,
      `select ${COLUMNS} from automation_revisions
       where automation_id = $automationId and revision = $revision`,
      { automationId, revision },
    );
  }

  latest(automationId: string): AutomationRevisionRow | undefined {
    return this.context.sql.get(
      STORED_REVISION,
      `select ${COLUMNS} from automation_revisions
       where automation_id = $automationId order by revision desc limit 1`,
      { automationId },
    );
  }

  list(automationId: string): AutomationRevisionRow[] {
    return this.context.sql.all(
      STORED_REVISION,
      `select ${COLUMNS} from automation_revisions
       where automation_id = $automationId order by revision desc`,
      { automationId },
    );
  }
}
