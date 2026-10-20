import {
  AUTOMATION_VALUE_ROW,
  ApiError,
  NODE_REGISTRY,
  applyAutomationValueOperation,
  programReferences,
  validateAutomationValue,
  type AutomationValueContent,
  type AutomationValueOperation,
  type AutomationValueRow,
  type AutomationV3,
  type FunctionV3,
  type ReferenceContext,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';
import { AutomationFunctionsRepository } from './automation-functions';
import { AutomationProgramsRepository } from './automation-programs';

const STORED_VALUE = storedRow(AUTOMATION_VALUE_ROW, { json: ['content'] });
const COLUMNS = Object.keys(AUTOMATION_VALUE_ROW.shape).join(',');

export class AutomationValuesRepository {
  constructor(private readonly context: StoreContext) {}

  list(): AutomationValueRow[] {
    return this.context.sql.all(
      STORED_VALUE,
      `select ${COLUMNS} from automation_values where owner_automation_id is null order by created_at, id`,
    );
  }

  byId(id: string): AutomationValueRow {
    return found(
      this.context.sql.get(
        STORED_VALUE,
        `select ${COLUMNS} from automation_values where id=$id and owner_automation_id is null`,
        { id },
      ),
      'automation Value',
      id,
    );
  }

  create(content: AutomationValueContent): AutomationValueRow {
    return this.context.write(() => {
      const validated = validateAutomationValue(content);
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'create automation Value',
        'insert into automation_values(id,content,revision,created_at,updated_at) values($id,$content,1,$now,$now)',
        { id, content: jsonText(validated), now },
      );
      const row = this.byId(id);
      this.context.changed('automation_values', 'INSERT', row, null);
      return row;
    });
  }

  update(
    id: string,
    content: AutomationValueContent,
    expectedRevision?: number,
  ): AutomationValueRow {
    return this.context.write(() => {
      const before = this.byId(id);
      if (expectedRevision !== undefined && before.revision !== expectedRevision)
        throw new ApiError(
          'conflict',
          'The Value changed; reload its current revision before editing.',
        );
      const validated = validateAutomationValue(content);
      if (before.content.kind !== validated.kind)
        throw new ApiError(
          'invalid_request',
          'A Value’s kind cannot change. Create a new Value instead.',
        );
      this.checkRemovedChoices(before.content, validated);
      return this.change(before, validated);
    });
  }

  apply(id: string, operation: AutomationValueOperation): AutomationValueRow {
    return this.context.write(() => {
      const before = this.byId(id);
      return this.change(before, applyAutomationValueOperation(before.content, operation));
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.requireUnreferenced(id);
      this.context.sql.run(
        'remove automation Value',
        'delete from automation_values where id=$id',
        { id },
      );
      this.context.changed('automation_values', 'DELETE', null, before);
    });
  }

  private referenceContext(): ReferenceContext {
    const functions = new AutomationFunctionsRepository(this.context);
    return {
      kinds: (kind) => NODE_REGISTRY.get(kind),
      functions: (id, pin): FunctionV3 | undefined => {
        if (pin !== undefined) return functions.findRevision(id, pin)?.definition;
        return functions.find(id) === undefined ? undefined : functions.latest(id).definition;
      },
    };
  }

  private requireUnreferenced(id: string): void {
    const context = this.referenceContext();
    const programsOf = (row: {
      definition: AutomationV3;
      draft: { program: AutomationV3 } | null;
    }): readonly AutomationV3[] =>
      row.draft === null ? [row.definition] : [row.definition, row.draft.program];
    const automation = new AutomationProgramsRepository(this.context)
      .list()
      .find((row) => programsOf(row).some((program) => programReferences(program, id, context)));
    if (automation !== undefined)
      throw new ApiError(
        'conflict',
        `The Value or choice is referenced by automation ${automation.name}. Remove its references first.`,
      );
  }

  private checkRemovedChoices(before: AutomationValueContent, after: AutomationValueContent): void {
    if (before.kind !== 'choice' || after.kind !== 'choice') return;
    for (const entry of before.choices) {
      if (!after.choices.some((next) => next.id === entry.id)) this.requireUnreferenced(entry.id);
    }
  }

  private change(before: AutomationValueRow, content: AutomationValueContent): AutomationValueRow {
    this.context.sql.run(
      'change automation Value',
      'update automation_values set content=$content,revision=revision+1,updated_at=$now where id=$id',
      { content: jsonText(content), now: this.context.now(), id: before.id },
    );
    const after = this.byId(before.id);
    this.context.changed('automation_values', 'UPDATE', after, before);
    return after;
  }
}
