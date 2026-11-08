import { z } from 'zod';
import { assignments, found, type StoreContext } from '../context';
import { inList } from '../sql';

export const DRIVE_TIME_SOURCES = [
  'metadata',
  'container',
  'filename',
  'modified',
  'manual',
] as const;

export const DRIVE_DERIVED_STATES = ['none', 'ready', 'failed', 'unsupported'] as const;

const DERIVED_STATE = z.enum(DRIVE_DERIVED_STATES);

const REASON = z.string().min(1).nullable();

const ID = z.string().min(1);

const FIELDS = {
  item_id: ID,
  time_source: z.enum(DRIVE_TIME_SOURCES),
  tz_offset_min: z.int().min(-1440).max(1440).nullable(),
  thumbhash: z.instanceof(Uint8Array).nullable(),
  preview_state: DERIVED_STATE,
  preview_reason: REASON,
  poster_state: DERIVED_STATE,
  poster_reason: REASON,
  playable_state: DERIVED_STATE,
  playable_reason: REASON,
  motion_clip_id: ID.nullable(),
  live_id: ID.nullable(),
  burst_id: ID.nullable(),
  stem_key: ID.nullable(),
  stack_id: ID.nullable(),
  place_id: ID.nullable(),
};

export const DRIVE_MEDIA_ROW = z.strictObject(FIELDS).readonly();

export type DriveMediaRow = z.infer<typeof DRIVE_MEDIA_ROW>;

export type DriveMediaPatch = Partial<Omit<DriveMediaRow, 'item_id'>>;

const COLUMNS = Object.keys(FIELDS).join(', ');

const SELECT = `select ${COLUMNS} from drive_media`;

export class DriveMediaRepository {
  constructor(private readonly context: StoreContext) {}

  find(itemId: string): DriveMediaRow | undefined {
    return this.context.sql.get(DRIVE_MEDIA_ROW, `${SELECT} where item_id = $itemId`, { itemId });
  }

  byId(itemId: string): DriveMediaRow {
    return found(this.find(itemId), 'media record', itemId);
  }

  list(itemIds: readonly string[]): DriveMediaRow[] {
    const filter = inList('item_id', 'ids', itemIds);
    return this.context.sql.all(
      DRIVE_MEDIA_ROW,
      `${SELECT} where ${filter.text} order by item_id`,
      filter.parameters,
    );
  }

  inStack(stackId: string): DriveMediaRow[] {
    return this.context.sql.all(
      DRIVE_MEDIA_ROW,
      `${SELECT} where stack_id = $stackId order by item_id`,
      {
        stackId,
      },
    );
  }

  withLiveId(liveId: string): DriveMediaRow[] {
    return this.context.sql.all(
      DRIVE_MEDIA_ROW,
      `${SELECT} where live_id = $liveId order by item_id`,
      {
        liveId,
      },
    );
  }

  withBurstId(burstId: string): DriveMediaRow[] {
    return this.context.sql.all(
      DRIVE_MEDIA_ROW,
      `${SELECT} where burst_id = $burstId order by item_id`,
      { burstId },
    );
  }

  withStemKey(stemKey: string): DriveMediaRow[] {
    return this.context.sql.all(
      DRIVE_MEDIA_ROW,
      `${SELECT} where stem_key = $stemKey order by item_id`,
      { stemKey },
    );
  }

  inPlace(placeId: string): DriveMediaRow[] {
    return this.context.sql.all(
      DRIVE_MEDIA_ROW,
      `${SELECT} where place_id = $placeId order by item_id`,
      {
        placeId,
      },
    );
  }

  save(input: DriveMediaRow): DriveMediaRow {
    return this.context.write(() => {
      const row = DRIVE_MEDIA_ROW.parse(input);
      const values = { ...row };
      const set = Object.keys(values)
        .filter((column) => column !== 'item_id')
        .map((column) => `${column} = excluded.${column}`)
        .join(', ');
      this.context.sql.run(
        'save the media record',
        `insert into drive_media (${COLUMNS}) values (${Object.keys(values)
          .map((column) => `$${column}`)
          .join(', ')})
         on conflict (item_id) do update set ${set}`,
        values,
      );
      return row;
    });
  }

  update(itemId: string, patch: DriveMediaPatch): DriveMediaRow {
    return this.context.write(() => {
      const after = DRIVE_MEDIA_ROW.parse({ ...this.byId(itemId), ...patch });
      const set = assignments({ ...after });
      this.context.sql.run(
        'change the media record',
        `update drive_media set ${set.text} where item_id = $item_id`,
        set.parameters,
      );
      return after;
    });
  }

  assignStack(itemIds: readonly string[], stackId: string | null): void {
    const filter = inList('item_id', 'ids', itemIds);
    this.context.sql.run(
      'assign the media to a stack',
      `update drive_media set stack_id = $stackId where ${filter.text}`,
      { ...filter.parameters, stackId },
    );
  }
}
