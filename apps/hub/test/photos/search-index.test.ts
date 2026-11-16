import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PhotoSearchIndexer } from '../../src/photos/search-index';
import { openKit, type Kit } from './sharing/fixture';

let kit: Kit;
let indexer: PhotoSearchIndexer;
const deferred: (() => void)[] = [];

beforeEach(async () => {
  kit = await openKit();
  deferred.length = 0;
  indexer = new PhotoSearchIndexer(kit.store, (work) => {
    deferred.push(work);
  });
});
afterEach(async () => {
  indexer.stop();
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

async function settle(): Promise<number> {
  const done = indexer.reconcile();
  for (let step = 0; step < 50; step += 1) {
    await Promise.resolve();
    deferred.splice(0).forEach((work) => {
      work();
    });
  }
  return done;
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

  it('after the first pass reads only the photos the feed names', async () => {
    const first = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', name: 'one.jpg' });
    const second = kit.seed({ n: 2, takenAt: '2026-03-01T10:00:00.000Z', name: 'two.jpg' });
    await settle();
    kit.store.database
      .prepare('update drive_items set taken_at = ? where id in (?, ?)')
      .run('2026-08-01T10:00:00.000Z', first, second);
    changed(second, 'update');
    expect(await settle()).toBe(1);
    expect(held()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: first, dates: '2026 March' }),
        expect.objectContaining({ item_id: second, dates: '2026 August' }),
      ]),
    );
  });

  it('reads every photo again after a change that adds no feed rows', async () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    indexer.start();
    deferred.splice(0).forEach((work) => {
      work();
    });
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

  it('runs once for a burst of drive changes and stops listening when stopped', async () => {
    indexer.start();
    expect(deferred).toHaveLength(1);
    deferred.shift()?.();
    await Promise.resolve();
    deferred.splice(0);
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
    expect(deferred).toHaveLength(1);
    indexer.stop();
    deferred.length = 0;
    kit.store.feed.notice(notice);
    expect(deferred).toHaveLength(0);
  });
});
