import {
  AUTOMATION_VALUE_ROW,
  AUTOMATION_V2,
  ApiError,
  applyAutomationValueOperation,
  validateAutomationValue,
  type AutomationValueContent,
  type AutomationValueOperation,
  type AutomationValueRow,
  automationReferences,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';
import { AutomationsRepository } from './automations';

const STORED_VALUE = storedRow(AUTOMATION_VALUE_ROW, { json: ['content'] });

export class AutomationValuesRepository {
  constructor(private readonly context: StoreContext) {}

  list(): AutomationValueRow[] {
    return this.context.sql.all(
      STORED_VALUE,
      'select * from automation_values order by created_at, id',
    );
  }

  byId(id: string): AutomationValueRow {
    return found(
      this.context.sql.get(STORED_VALUE, 'select * from automation_values where id=$id', { id }),
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

  private requireUnreferenced(id: string): void {
    const automation = new AutomationsRepository(this.context).list().find((row) => {
      const parsed = AUTOMATION_V2.safeParse(row.definition);
      return parsed.success && automationReferences(parsed.data, id);
    });
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
