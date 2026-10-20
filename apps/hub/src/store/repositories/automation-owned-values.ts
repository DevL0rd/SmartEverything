import { z } from 'zod';
import { ApiError, FLOW_TYPE, JSON_VALUE } from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

const NAME = z.string().trim().min(1).max(80);

const OWNED_VALUE_CONTENT = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), name: NAME, value: z.string() }),
  z.strictObject({ kind: z.literal('instant'), name: NAME, value: MOMENT.nullable() }),
  z.strictObject({ kind: z.literal('typed'), name: NAME, type: FLOW_TYPE, value: JSON_VALUE }),
]);

export type OwnedValueContent = z.infer<typeof OWNED_VALUE_CONTENT>;

const OWNED_VALUE_ROW = z.strictObject({
  id: ID,
  owner_automation_id: ID,
  content: OWNED_VALUE_CONTENT,
  revision: z.int().positive(),
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type OwnedValueRow = z.infer<typeof OWNED_VALUE_ROW>;

const STORED = storedRow(OWNED_VALUE_ROW, { json: ['content'] });
const COLUMNS = Object.keys(OWNED_VALUE_ROW.shape).join(',');

export class AutomationOwnedValuesRepository {
  constructor(private readonly context: StoreContext) {}

  list(automationId: string): OwnedValueRow[] {
    return this.context.sql.all(
      STORED,
      `select ${COLUMNS} from automation_values where owner_automation_id=$automationId order by created_at, id`,
      { automationId },
    );
  }

  byId(automationId: string, id: string): OwnedValueRow {
    return found(
      this.context.sql.get(
        STORED,
        `select ${COLUMNS} from automation_values where id=$id and owner_automation_id=$automationId`,
        { id, automationId },
      ),
      'owned automation Value',
      id,
    );
  }

  create(automationId: string, content: OwnedValueContent): OwnedValueRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'create owned automation Value',
        'insert into automation_values(id,content,revision,created_at,updated_at,owner_automation_id) values($id,$content,1,$now,$now,$automationId)',
        { id, content: jsonText(OWNED_VALUE_CONTENT.parse(content)), now, automationId },
      );
      return this.byId(automationId, id);
    });
  }

  write(
    automationId: string,
    id: string,
    content: OwnedValueContent,
    expectedRevision?: number,
  ): OwnedValueRow {
    return this.context.write(() => {
      const before = this.byId(automationId, id);
      if (expectedRevision !== undefined && before.revision !== expectedRevision)
        throw new ApiError('conflict', 'The Value changed; reload its current revision.');
      const checked = OWNED_VALUE_CONTENT.parse(content);
      if (checked.kind !== before.content.kind)
        throw new ApiError('invalid_request', 'A Value’s kind cannot change.');
      this.context.sql.run(
        'change owned automation Value',
        'update automation_values set content=$content,revision=revision+1,updated_at=$now where id=$id and owner_automation_id=$automationId',
        { content: jsonText(checked), now: this.context.now(), id, automationId },
      );
      return this.byId(automationId, id);
    });
  }

  remove(automationId: string, id: string): void {
    this.byId(automationId, id);
    this.context.sql.run(
      'remove owned automation Value',
      'delete from automation_values where id=$id and owner_automation_id=$automationId',
      { id, automationId },
    );
  }

  forget(automationId: string): number {
    return this.context.sql.run(
      'forget the Values owned by an automation',
      'delete from automation_values where owner_automation_id=$automationId',
      { automationId },
    );
  }
}
