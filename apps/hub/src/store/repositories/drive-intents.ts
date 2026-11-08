import { z } from 'zod';
import { found, type StoreContext } from '../context';

export const DRIVE_INTENT_OPS = ['trash', 'restore', 'version', 'commit'] as const;

export type DriveIntentOp = (typeof DRIVE_INTENT_OPS)[number];

const COLUMNS = 'id, root_id, op, from_path, to_path, version_path, at';

const INTENT_COLUMNS = z
  .strictObject({
    id: z.string(),
    root_id: z.string(),
    op: z.enum(DRIVE_INTENT_OPS),
    from_path: z.string(),
    to_path: z.string(),
    version_path: z.string().nullable(),
    at: z.string(),
  })
  .transform((row): DriveIntent => ({
    id: row.id,
    rootId: row.root_id,
    op: row.op,
    fromPath: row.from_path,
    toPath: row.to_path,
    versionPath: row.version_path,
    at: row.at,
  }));

export interface DriveIntent {
  readonly id: string;
  readonly rootId: string;
  readonly op: DriveIntentOp;
  readonly fromPath: string;
  readonly toPath: string;
  readonly versionPath: string | null;
  readonly at: string;
}

export type DriveIntentInput = Omit<DriveIntent, 'id' | 'at'>;

export class DriveIntentsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveIntent | undefined {
    return this.context.sql.get(
      INTENT_COLUMNS,
      `select ${COLUMNS} from drive_intents where id = $id`,
      {
        id,
      },
    );
  }

  open(input: DriveIntentInput): DriveIntent {
    return this.context.write(() => {
      const intent: DriveIntent = { ...input, id: this.context.newId(), at: this.context.now() };
      this.context.sql.run(
        'open the drive intent',
        `insert into drive_intents (${COLUMNS})
          values ($id, $rootId, $op, $fromPath, $toPath, $versionPath, $at)`,
        {
          id: intent.id,
          rootId: intent.rootId,
          op: intent.op,
          fromPath: intent.fromPath,
          toPath: intent.toPath,
          versionPath: intent.versionPath,
          at: intent.at,
        },
      );
      return intent;
    });
  }

  clear(id: string): void {
    this.context.write(() => {
      found(this.find(id), 'drive intent', id);
      this.context.sql.run('clear the drive intent', 'delete from drive_intents where id = $id', {
        id,
      });
    });
  }

  all(): DriveIntent[] {
    return this.context.sql.all(
      INTENT_COLUMNS,
      `select ${COLUMNS} from drive_intents order by at, id`,
    );
  }

  forRoot(rootId: string): DriveIntent[] {
    return this.context.sql.all(
      INTENT_COLUMNS,
      `select ${COLUMNS} from drive_intents where root_id = $rootId order by at, id`,
      { rootId },
    );
  }
}
