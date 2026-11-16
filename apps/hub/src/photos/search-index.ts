import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { StoreContext } from '../store/context';
import type { Store } from '../store/store';

const log = new Logger('hub.photos');

const WRITE_BATCH = 500;

const FEED_WINDOW = 1000;

const MONTHS = [
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

const WANTED = z.strictObject({
  id: z.string(),
  name: z.string(),
  rel_path: z.string(),
  moment: z.string(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  lens: z.string().nullable(),
  albums: z.string().nullable(),
});

const HELD = z.strictObject({
  item_id: z.string(),
  name: z.string(),
  path: z.string(),
  camera: z.string(),
  albums: z.string(),
  dates: z.string(),
});

interface Words {
  readonly name: string;
  readonly path: string;
  readonly camera: string;
  readonly albums: string;
  readonly dates: string;
}

function directoryOf(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash < 0 ? '' : relPath.slice(0, slash);
}

function dateWords(moment: string): string {
  const [year = '', month = ''] = moment.split('-');
  const named = MONTHS[Number(month) - 1];
  return named === undefined ? year : `${year} ${named}`;
}

function wordsOf(row: z.output<typeof WANTED>): Words {
  return {
    name: row.name,
    path: directoryOf(row.rel_path),
    camera: [row.make, row.model, row.lens].filter((part) => part !== null).join(' '),
    albums: row.albums ?? '',
    dates: dateWords(row.moment),
  };
}

function sameWords(held: z.output<typeof HELD>, wanted: Words): boolean {
  return (
    held.name === wanted.name &&
    held.path === wanted.path &&
    held.camera === wanted.camera &&
    held.albums === wanted.albums &&
    held.dates === wanted.dates
  );
}

type Change =
  | { readonly kind: 'insert'; readonly itemId: string; readonly words: Words }
  | { readonly kind: 'update'; readonly itemId: string; readonly words: Words }
  | { readonly kind: 'remove'; readonly itemId: string };

const PHOTO_COLUMNS = `select i.id, i.name, i.rel_path, coalesce(i.taken_at, i.modified_at) as moment,
    i.camera_make as make, i.camera_model as model, i.camera_lens as lens,
    (select group_concat(al.title, ' ' order by al.title) from drive_album_items ai
      join drive_albums al on al.id = ai.album_id
      where ai.item_id = i.id) as albums
  from drive_items i where i.kind in ('image', 'video')`;

export class PhotoSearchIndexer {
  private stops: (() => void)[] = [];
  private pending = false;
  private running = false;
  private cursor: number | null = null;

  constructor(
    private readonly store: Pick<Store, 'context' | 'feed' | 'driveFeed'>,
    private readonly defer: (work: () => void) => void = setImmediate,
  ) {}

  start(): void {
    this.stops.push(
      this.store.feed.subscribeNotices((notice) => {
        if (notice.type !== 'drive_changed') return;
        if (notice.albumIds.length > 0 || (this.cursor !== null && notice.cursor <= this.cursor)) {
          this.cursor = null;
        }
        this.schedule();
      }),
    );
    this.schedule();
  }

  stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
  }

  async reconcile(): Promise<number> {
    const { context } = this.store;
    const head = this.store.driveFeed.latestSeq();
    const after = this.cursor;
    this.cursor = head;
    const changes = after === null ? this.changes(context) : this.changedSince(context, after, head);
    for (let start = 0; start < changes.length; start += WRITE_BATCH) {
      context.write(() => {
        for (const change of changes.slice(start, start + WRITE_BATCH)) this.apply(context, change);
      });
      await new Promise<void>((resolve) => {
        this.defer(resolve);
      });
    }
    return changes.length;
  }

  private schedule(): void {
    if (this.pending) return;
    this.pending = true;
    this.defer(() => {
      this.pending = false;
      this.run();
    });
  }

  private run(): void {
    if (this.running) {
      this.schedule();
      return;
    }
    this.running = true;
    this.reconcile()
      .catch((cause: unknown) => {
        this.cursor = null;
        log.error('photos_search.index_failed', cause);
      })
      .finally(() => {
        this.running = false;
      });
  }

  private changes(context: StoreContext): Change[] {
    const held = new Map(
      context.sql
        .all(HELD, 'select item_id, name, path, camera, albums, dates from drive_items_search')
        .map((row) => [row.item_id, row]),
    );
    return this.compare(held, context.sql.all(WANTED, PHOTO_COLUMNS));
  }

  private changedSince(context: StoreContext, after: number, head: number): Change[] {
    const ids = new Set<string>();
    for (let cursor: number | null = after; cursor !== null && cursor < head; ) {
      const window = this.store.driveFeed.since(cursor, FEED_WINDOW);
      for (const row of window.rows) if (row.seq <= head) ids.add(row.itemId);
      cursor = window.next;
    }
    if (ids.size === 0) return [];
    const list = { ids: JSON.stringify([...ids]) };
    const held = new Map(
      context.sql
        .all(
          HELD,
          `select item_id, name, path, camera, albums, dates from drive_items_search
            where item_id in (select value from json_each($ids))`,
          list,
        )
        .map((row) => [row.item_id, row]),
    );
    const wanted = context.sql.all(
      WANTED,
      `${PHOTO_COLUMNS} and i.id in (select value from json_each($ids))`,
      list,
    );
    return this.compare(held, wanted);
  }

  private compare(
    held: Map<string, z.output<typeof HELD>>,
    wanted: readonly z.output<typeof WANTED>[],
  ): Change[] {
    const changes: Change[] = [];
    for (const row of wanted) {
      const words = wordsOf(row);
      const current = held.get(row.id);
      held.delete(row.id);
      if (current === undefined) changes.push({ kind: 'insert', itemId: row.id, words });
      else if (!sameWords(current, words)) changes.push({ kind: 'update', itemId: row.id, words });
    }
    for (const itemId of held.keys()) changes.push({ kind: 'remove', itemId });
    return changes;
  }

  private apply(context: StoreContext, change: Change): void {
    if (change.kind === 'remove') {
      context.sql.run(
        'remove the search entry of a photo that is gone',
        'delete from drive_items_search where item_id = $itemId',
        { itemId: change.itemId },
      );
      return;
    }
    const { itemId, words } = change;
    if (change.kind === 'insert') {
      context.sql.run(
        'index the photo for search',
        `insert into drive_items_search (item_id, name, path, camera, albums, dates, labels)
          values ($itemId, $name, $path, $camera, $albums, $dates, '')`,
        { itemId, ...words },
      );
      return;
    }
    context.sql.run(
      'update the search entry of the photo',
      `update drive_items_search
        set name = $name, path = $path, camera = $camera, albums = $albums, dates = $dates
        where item_id = $itemId`,
      { itemId, ...words },
    );
  }
}
