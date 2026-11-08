import { z } from 'zod';
import { inList } from '../sql';
import { found, type StoreContext } from '../context';

export const DRIVE_MEDIA_JOB_KINDS = [
  'preview',
  'poster',
  'playable',
  'playable_source',
  'motion',
  'place',
] as const;

export const DRIVE_MEDIA_JOB_STATES = ['queued', 'running', 'done', 'failed'] as const;

const SQL_BOOLEAN = z.union([z.literal(0), z.literal(1)]).transform((value) => value === 1);

const STORED_JOB = z
  .strictObject({
    id: z.string().min(1),
    kind: z.enum(DRIVE_MEDIA_JOB_KINDS),
    item_id: z.string().min(1),
    rev: z.int().positive(),
    state: z.enum(DRIVE_MEDIA_JOB_STATES),
    visible: SQL_BOOLEAN,
    attempts: z.int().nonnegative(),
    progress: z.number().min(0).max(1).nullable(),
    error: z.string().min(1).nullable(),
    model_version: z.string().min(1).nullable(),
    queued_at: z.string().min(1),
  })
  .readonly();

export type DriveMediaJob = z.infer<typeof STORED_JOB>;

export type DriveMediaJobKind = (typeof DRIVE_MEDIA_JOB_KINDS)[number];

export interface DriveMediaJobRequest {
  readonly kind: DriveMediaJobKind;
  readonly itemId: string;
  readonly rev: number;
  readonly visible?: boolean;
  readonly modelVersion?: string;
}

export interface DriveMediaJobTally {
  readonly kind: DriveMediaJobKind;
  readonly state: DriveMediaJob['state'];
  readonly total: number;
}

const TALLY = z.strictObject({
  kind: z.enum(DRIVE_MEDIA_JOB_KINDS),
  state: z.enum(DRIVE_MEDIA_JOB_STATES),
  total: z.int().nonnegative(),
});

const COLUMNS =
  'id, kind, item_id, rev, state, visible, attempts, progress, error, model_version, queued_at';

const SELECT = `select ${COLUMNS} from drive_media_jobs`;

export class DriveMediaJobsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveMediaJob | undefined {
    return this.context.sql.get(STORED_JOB, `${SELECT} where id = $id`, { id });
  }

  byId(id: string): DriveMediaJob {
    return found(this.find(id), 'media job', id);
  }

  forItem(itemId: string): DriveMediaJob[] {
    return this.context.sql.all(
      STORED_JOB,
      `${SELECT} where item_id = $itemId order by queued_at, id`,
      {
        itemId,
      },
    );
  }

  failures(): DriveMediaJob[] {
    return this.context.sql.all(
      STORED_JOB,
      `${SELECT} where state = 'failed' order by queued_at, id`,
    );
  }

  tally(): DriveMediaJobTally[] {
    return this.context.sql.all(
      TALLY,
      `select kind, state, count(*) as total from drive_media_jobs
       where state <> 'done' group by kind, state order by kind, state`,
    );
  }

  enqueue(request: DriveMediaJobRequest): DriveMediaJob {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'queue the media job',
        `insert into drive_media_jobs (id, kind, item_id, rev, state, visible, attempts, model_version, queued_at)
         values ($id, $kind, $itemId, $rev, 'queued', $visible, 0, $modelVersion, $now)
         on conflict (item_id, rev, kind) do update set
           visible = max(drive_media_jobs.visible, excluded.visible)`,
        {
          id,
          kind: request.kind,
          itemId: request.itemId,
          rev: request.rev,
          visible: request.visible === true ? 1 : 0,
          modelVersion: request.modelVersion ?? null,
          now: this.context.now(),
        },
      );
      return this.forRevision(request);
    });
  }

  claim(kinds: readonly DriveMediaJobKind[]): DriveMediaJob | undefined {
    return this.context.write(() => {
      const filter = inList('kind', 'kinds', kinds);
      const next = this.context.sql.get(
        STORED_JOB,
        `${SELECT} where state = 'queued' and ${filter.text}
         order by visible desc, (kind = 'playable_source'), queued_at, id limit 1`,
        filter.parameters,
      );
      if (next === undefined) {
        return undefined;
      }
      this.context.sql.run(
        'start the media job',
        `update drive_media_jobs set state = 'running', attempts = attempts + 1, error = null
         where id = $id`,
        { id: next.id },
      );
      return this.byId(next.id);
    });
  }

  makeVisible(itemId: string): number {
    return this.context.sql.run(
      'prioritise the media jobs of an item',
      `update drive_media_jobs set visible = 1
       where item_id = $itemId and state = 'queued' and visible = 0`,
      { itemId },
    );
  }

  report(id: string, progress: number): void {
    this.context.sql.run(
      'record the media job progress',
      "update drive_media_jobs set progress = $progress where id = $id and state = 'running'",
      { id, progress },
    );
  }

  complete(id: string): void {
    this.context.sql.run(
      'finish the media job',
      "update drive_media_jobs set state = 'done', progress = null, error = null where id = $id",
      { id },
    );
  }

  fail(id: string, error: string): void {
    this.context.sql.run(
      'record the media job failure',
      "update drive_media_jobs set state = 'failed', progress = null, error = $error where id = $id",
      { id, error },
    );
  }

  retry(id: string): void {
    this.context.sql.run(
      'queue the failed media job again',
      "update drive_media_jobs set state = 'queued', progress = null where id = $id and state = 'failed'",
      { id },
    );
  }

  requeueRunning(): number {
    return this.context.sql.run(
      'queue the interrupted media jobs again',
      "update drive_media_jobs set state = 'queued', progress = null where state = 'running'",
    );
  }

  removeOlderRevisions(itemId: string, rev: number): number {
    return this.context.sql.run(
      'drop the media jobs of older revisions',
      'delete from drive_media_jobs where item_id = $itemId and rev < $rev',
      { itemId, rev },
    );
  }

  private forRevision(request: DriveMediaJobRequest): DriveMediaJob {
    return found(
      this.context.sql.get(
        STORED_JOB,
        `${SELECT} where item_id = $itemId and rev = $rev and kind = $kind`,
        { itemId: request.itemId, rev: request.rev, kind: request.kind },
      ),
      'media job',
      `${request.itemId}@${String(request.rev)}`,
    );
  }
}
