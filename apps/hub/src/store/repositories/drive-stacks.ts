import { z } from 'zod';
import { found, type StoreContext } from '../context';

export const DRIVE_STACK_KINDS = ['burst', 'stem'] as const;

export const DRIVE_STACK_ROW = z
  .strictObject({
    id: z.string().min(1),
    kind: z.enum(DRIVE_STACK_KINDS),
    cover_item_id: z.string().min(1).nullable(),
  })
  .readonly();

export type DriveStackRow = z.infer<typeof DRIVE_STACK_ROW>;

export type DriveStackKind = DriveStackRow['kind'];

const COLUMNS = 'id, kind, cover_item_id';

export class DriveStacksRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveStackRow | undefined {
    return this.context.sql.get(
      DRIVE_STACK_ROW,
      `select ${COLUMNS} from drive_stacks where id = $id`,
      {
        id,
      },
    );
  }

  byId(id: string): DriveStackRow {
    return found(this.find(id), 'stack', id);
  }

  list(): DriveStackRow[] {
    return this.context.sql.all(DRIVE_STACK_ROW, `select ${COLUMNS} from drive_stacks order by id`);
  }

  create(kind: DriveStackKind, coverItemId: string): DriveStackRow {
    return this.context.write(() => {
      const row = DRIVE_STACK_ROW.parse({
        id: this.context.newId(),
        kind,
        cover_item_id: coverItemId,
      });
      this.context.sql.run(
        'add the stack',
        'insert into drive_stacks (id, kind, cover_item_id) values ($id, $kind, $cover_item_id)',
        { ...row },
      );
      return row;
    });
  }

  setCover(id: string, coverItemId: string): DriveStackRow {
    return this.context.write(() => {
      const after = DRIVE_STACK_ROW.parse({ ...this.byId(id), cover_item_id: coverItemId });
      this.context.sql.run(
        'change the stack cover',
        'update drive_stacks set cover_item_id = $cover where id = $id',
        {
          id,
          cover: coverItemId,
        },
      );
      return after;
    });
  }

  remove(id: string): void {
    this.context.sql.run('remove the stack', 'delete from drive_stacks where id = $id', { id });
  }
}
