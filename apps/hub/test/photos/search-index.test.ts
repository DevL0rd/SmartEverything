import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { z } from 'zod';
import { PhotoSearchIndexer } from '../../src/photos/search-index';
import { openKit, type Kit } from './sharing/fixture';

let kit: Kit;
let indexer: PhotoSearchIndexer;
let reads: MockInstance;

beforeEach(async () => {
  kit = await openKit();
  reads = vi.spyOn(kit.store.reader, 'all');
  indexer = new PhotoSearchIndexer(kit.store);
});
afterEach(async () => {
  await indexer.stop();
  await kit.test.close();
});

const HELD = z.strictObject({
  item_id: z.string(),
  name: z.string(),
  path: z.string(),
  dates: z.string(),
  albums: z.string(),
  labels: z.string(),
});

function held(): z.output<typeof HELD>[] {
  return kit.store.database
    .prepare(
      'select item_id, name, path, dates, albums, labels from drive_items_search order by item_id',
    )
    .all()
    .map((row) => HELD.parse(row));
}

function settle(): Promise<number> {
  return indexer.reconcile();
}

function changed(itemId: string, op: 'update' | 'delete'): void {
  kit.store.driveFeed.append({
    rootId: kit.aliceRoot,
    itemId,
    op,
    rev: 2,
    actorProfileId: null,
    via: 'outside',
    deviceId: null,
  });
}

function find(words: string): string[] {
  return kit.store.database
    .prepare('select item_id from drive_items_search where drive_items_search match ?')
    .all(words)
    .map((row) => String(row['item_id']));
}

describe('the Photos search index', () => {
  it('indexes name, folder, date and album of every photo and finds it by them', async () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', name: 'Trips/beach.jpg' });
    kit.album(kit.alice, [id]);
    expect(await settle()).toBe(1);
    expect(held()).toMatchObject([
      { item_id: id, name: 'beach.jpg', path: 'Trips', dates: '2026 March', albums: 'Holiday' },
    ]);
    expect(find('"beach"*')).toEqual([id]);
    expect(find('"march"*')).toEqual([id]);
    expect(find('"holiday"*')).toEqual([id]);
  });

  it('changes nothing when nothing changed and keeps the labels the analysis wrote', async () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    await settle();
    kit.store.database
      .prepare("update drive_items_search set labels = 'dog beach' where item_id = ?")
      .run(id);
    expect(await settle()).toBe(0);
    kit.store.database
      .prepare('update drive_items set taken_at = ? where id = ?')
      .run('2026-07-01T10:00:00.000Z', id);
    changed(id, 'update');
    expect(await settle()).toBe(1);
    expect(held()).toMatchObject([{ item_id: id, dates: '2026 July', labels: 'dog beach' }]);
  });

  it('drops the entry of a photo that is gone', async () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    await settle();
    kit.store.database.prepare('delete from drive_items where id = ?').run(id);
    changed(id, 'delete');
    expect(await settle()).toBe(1);
    expect(held()).toEqual([]);
  });

  it('picks up every changed photo whether or not the feed names it', async () => {
    const first = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', name: 'one.jpg' });
    const second = kit.seed({ n: 2, takenAt: '2026-03-01T10:00:00.000Z', name: 'two.jpg' });
    await settle();
    kit.store.database
      .prepare('update drive_items set taken_at = ? where id in (?, ?)')
      .run('2026-08-01T10:00:00.000Z', first, second);
    changed(second, 'update');
    expect(await settle()).toBe(2);
    expect(held()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: first, dates: '2026 August' }),
        expect.objectContaining({ item_id: second, dates: '2026 August' }),
      ]),
    );
  });

  it('reads every photo again after a change that adds no feed rows', async () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    await settle();
    kit.store.database
      .prepare('update drive_items set taken_at = ? where id = ?')
      .run('2026-09-01T10:00:00.000Z', id);
    kit.store.feed.notice({
      type: 'drive_changed',
      rootIds: [kit.aliceRoot],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: kit.store.driveFeed.latestSeq(),
    });
    expect(await settle()).toBe(1);
    expect(held()).toMatchObject([{ item_id: id, dates: '2026 September' }]);
  });

  it('runs once more for a burst of drive changes and stops listening when stopped', async () => {
    kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    indexer.start();
    const notice = {
      type: 'drive_changed',
      rootIds: [],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: 1,
    } as const;
    kit.store.feed.notice(notice);
    kit.store.feed.notice(notice);
    kit.store.feed.notice(notice);
    await indexer.idle();
    expect(reads).toHaveBeenCalledTimes(4);
    expect(held()).toHaveLength(1);
    await indexer.stop();
    kit.store.feed.notice(notice);
    await indexer.idle();
    expect(reads).toHaveBeenCalledTimes(4);
  });
});
