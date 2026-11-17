import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { StoreContext } from '../store/context';
import { Coalesced } from '../store/reader';
import { inSlices } from '../store/slices';
import type { Store } from '../store/store';

const log = new Logger('hub.photos');

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTH_CASE = `case cast(month as integer) ${MONTH_NAMES.map(
  (name, index) => `when ${String(index + 1)} then ' ${name}'`,
).join(' ')} else '' end`;

const WANTED = `select item_id, name, path, camera, albums, year || ${MONTH_CASE} as dates
  from (select item_id, name, path, camera, albums,
      case when instr(moment, '-') = 0 then moment else substr(moment, 1, instr(moment, '-') - 1) end as year,
      case when instr(rest, '-') = 0 then rest else substr(rest, 1, instr(rest, '-') - 1) end as month
    from (select i.id as item_id, i.name,
        rtrim(rtrim(i.rel_path, replace(i.rel_path, '/', '')), '/') as path,
        concat_ws(' ', i.camera_make, i.camera_model, i.camera_lens) as camera,
        coalesce((select group_concat(al.title, ' ' order by al.title) from drive_album_items ai
          join drive_albums al on al.id = ai.album_id where ai.item_id = i.id), '') as albums,
        coalesce(i.taken_at, i.modified_at) as moment,
        case when instr(coalesce(i.taken_at, i.modified_at), '-') = 0 then ''
          else substr(coalesce(i.taken_at, i.modified_at), instr(coalesce(i.taken_at, i.modified_at), '-') + 1)
        end as rest
      from drive_items i where i.kind in ('image', 'video')))`;

const STALE = `with wanted as materialized (${WANTED}),
    held as materialized (select rowid as row_id, item_id, name, path, camera, albums, dates
      from drive_items_search)
  select w.item_id, w.name, w.path, w.camera, w.albums, w.dates, h.row_id
  from wanted w left join held h on h.item_id = w.item_id
  where h.row_id is null or h.name is not w.name or h.path is not w.path
    or h.camera is not w.camera or h.albums is not w.albums or h.dates is not w.dates`;

const GONE = `select s.rowid as row_id from drive_items_search s
  where not exists (select 1 from drive_items i
    where i.id = s.item_id and i.kind in ('image', 'video'))`;

const STALE_ROW = z.strictObject({
  item_id: z.string(),
  name: z.string(),
  path: z.string(),
  camera: z.string(),
  albums: z.string(),
  dates: z.string(),
  row_id: z.int().nullable(),
});

const GONE_ROW = z.strictObject({ row_id: z.int() });

type Change =
  | { readonly kind: 'write'; readonly row: z.output<typeof STALE_ROW> }
  | { readonly kind: 'remove'; readonly rowId: number };

export class PhotoSearchIndexer {
  private stops: (() => void)[] = [];
  private readonly pass: Coalesced;

  constructor(
    private readonly store: Pick<Store, 'context' | 'feed' | 'reader'>,
    private readonly defer: (work: () => void) => void = setImmediate,
  ) {
    this.pass = new Coalesced(
      async () => {
        await this.reconcile();
      },
      (cause) => {
        log.error('photos_search.index_failed', cause);
      },
    );
  }

  start(): void {
    this.stops.push(
      this.store.feed.subscribeNotices((notice) => {
        if (notice.type === 'drive_changed') this.pass.trigger();
      }),
    );
    this.pass.trigger();
  }

  idle(): Promise<void> {
    return this.pass.idle();
  }

  async stop(): Promise<void> {
    for (const stop of this.stops) stop();
    this.stops = [];
    await this.pass.stop();
  }

  async reconcile(): Promise<number> {
    const { context, reader } = this.store;
    const [stale, gone] = await Promise.all([
      reader.all(STALE_ROW, STALE),
      reader.all(GONE_ROW, GONE),
    ]);
    const changes: Change[] = [
      ...stale.map((row): Change => ({ kind: 'write', row })),
      ...gone.map((row): Change => ({ kind: 'remove', rowId: row.row_id })),
    ];
    await inSlices(
      context,
      changes,
      (change) => {
        this.apply(context, change);
      },
      this.defer,
    );
    return changes.length;
  }

  private apply(context: StoreContext, change: Change): void {
    if (change.kind === 'remove') {
      context.sql.run(
        'remove the search entry of a photo that is gone',
        'delete from drive_items_search where rowid = $rowId',
        { rowId: change.rowId },
      );
      return;
    }
    const { row_id: rowId, item_id: itemId, name, path, camera, albums, dates } = change.row;
    const words = { itemId, name, path, camera, albums, dates };
    if (rowId === null) {
      context.sql.run(
        'index the photo for search',
        `insert into drive_items_search (item_id, name, path, camera, albums, dates, labels)
          values ($itemId, $name, $path, $camera, $albums, $dates, '')`,
        words,
      );
      return;
    }
    context.sql.run(
      'update the search entry of the photo',
      `update drive_items_search
        set name = $name, path = $path, camera = $camera, albums = $albums, dates = $dates
        where rowid = $rowId and item_id = $itemId`,
      { ...words, rowId },
    );
  }
}
