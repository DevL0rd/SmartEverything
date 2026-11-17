import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../../src/drive/access';
import { LibraryReader } from '../../../src/photos/library';
import { z } from 'zod';
import { PEOPLE_COUNT_SQL } from '../../../src/photos/people/counts';
import { PhotoSearch, type MeaningSource } from '../../../src/photos/people/search';
import { PhotoSuggest } from '../../../src/photos/people/suggest';
import { testLogger } from '../../support/logs';
import {
  BOB_ROOT,
  addFace,
  addLabels,
  addText,
  alice,
  bob,
  context,
  database,
  direction,
  groups,
  people,
  resetConsent,
  seed,
  setup,
  teardown,
} from './fixture';

beforeEach(() => {
  setup();
  resetConsent();
});

afterEach(teardown);

const MARCH = '2026-03';

function reader(): LibraryReader {
  return new LibraryReader(context, () => 'UTC');
}

function ids(actor: DriveActor, scope: Parameters<LibraryReader['page']>[2]): readonly string[] {
  return reader().page(actor, MARCH, scope).ids;
}

function addDescription(itemId: string, text: string | null, source: 'file' | 'manual'): void {
  database
    .prepare(
      `insert into photo_descriptions (item_id, text, source, set_by, set_at)
        values (?, ?, ?, null, '2026-11-17T10:00:00.000Z')`,
    )
    .run(itemId, text, source);
}

function photo(n: number, root?: string): string {
  return seed({
    n,
    takenAt: `2026-03-${String(n).padStart(2, '0')}T10:00:00.000Z`,
    ...(root === undefined ? {} : { root }),
  });
}

describe('people and pets as library tokens', () => {
  it('lists the photos of one person with the library shape and nobody else', async () => {
    const [a, b, c] = [photo(1), photo(2), photo(3)];
    addFace({ itemId: a, embedding: direction(0) });
    addFace({ itemId: b, embedding: direction(0, 0.1) });
    addFace({ itemId: c, embedding: direction(8) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    const big = service.people(alice).groups.find((group) => group.count === 2);
    expect(ids(alice, { filter: 'all', groupIds: [big?.id ?? ''] })).toEqual([b, a]);
    expect(reader().buckets(alice, { filter: 'all', groupIds: [big?.id ?? ''] })).toEqual([
      { month: MARCH, count: 2 },
    ]);
  });

  it('needs every named person on the photo and gives nothing for a group that is not the viewer’s', async () => {
    const [a, b] = [photo(1), photo(2)];
    addFace({ itemId: a, embedding: direction(0) });
    addFace({ itemId: a, embedding: direction(8) });
    addFace({ itemId: b, embedding: direction(0, 0.05) });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    const [one, two] = service.people(alice).groups;
    expect(ids(alice, { filter: 'all', groupIds: [one?.id ?? '', two?.id ?? ''] })).toEqual([a]);
    await service.regroup(bob.profileId, 'person');
    expect(ids(bob, { filter: 'all', groupIds: [one?.id ?? ''] })).toEqual([]);
  });

  it('keeps archived photos in people and search but out of the plain library', async () => {
    const a = photo(1);
    addFace({ itemId: a, embedding: direction(0) });
    addText(a, 'invoice 4421');
    const service = people();
    await service.regroup(alice.profileId, 'person');
    const [group] = service.people(alice).groups;
    database
      .prepare('insert into photo_archive (profile_id, item_id, archived_at) values (?, ?, ?)')
      .run(alice.profileId, a, '2026-11-14T10:00:00.000Z');
    expect(ids(alice, { filter: 'all' })).toEqual([]);
    expect(ids(alice, { filter: 'all', groupIds: [group?.id ?? ''] })).toEqual([a]);
    expect(ids(alice, { filter: 'all', photoText: 'invoice' })).toEqual([a]);
    expect(group?.count).toBe(1);
    expect(ids(bob, { filter: 'all' })).toEqual([a]);
  });
});

describe('words, text in photos and meaning', () => {
  it('finds labels exactly and ignores other people’s photos', () => {
    const a = photo(1);
    const b = photo(2);
    const secret = photo(3, BOB_ROOT);
    addLabels(a, ['Golden Retriever', 'beach']);
    addLabels(b, ['beach']);
    addLabels(secret, ['beach']);
    expect(ids(alice, { filter: 'all', labels: ['beach'] })).toEqual([b, a]);
    expect(ids(alice, { filter: 'all', labels: ['golden retriever'] })).toEqual([a]);
    expect(ids(alice, { filter: 'all', labels: ['beach', 'golden retriever'] })).toEqual([a]);
    expect(ids(bob, { filter: 'all', labels: ['beach'] })).toEqual([secret, b, a]);
  });

  it('finds text read from photos by words', () => {
    const a = photo(1);
    photo(2);
    addText(a, 'Boarding pass Lisbon');
    expect(ids(alice, { filter: 'all', photoText: 'lisbon' })).toEqual([a]);
  });

  it('unites words and meaning hits in the normal page shape', async () => {
    const [a, b, c] = [photo(1), photo(2), photo(3)];
    addLabels(a, ['dog']);
    addText(b, 'dog food receipt');
    const asked: string[] = [];
    const meaning: MeaningSource = {
      meaning: (actor, text) => {
        asked.push(`${actor.profileId}:${text}`);
        return Promise.resolve([{ itemId: c, score: 0.7 }]);
      },
    };
    const search = new PhotoSearch(reader(), meaning, testLogger('photos'), () => 0);
    const page = await search.page(alice, MARCH, { filter: 'all', meaning: 'dog' });
    expect(page.ids).toEqual([c, b, a]);
    expect(await search.buckets(alice, { filter: 'all', meaning: 'dog' })).toEqual([
      { month: MARCH, count: 3 },
    ]);
    expect(asked).toHaveLength(1);
  });

  it('finds descriptions by partial words in any case, each word on its own', () => {
    const [a, b, c] = [photo(1), photo(2), photo(3)];
    const secret = photo(4, BOB_ROOT);
    addDescription(a, 'Sunset at the HARBOUR', 'file');
    addDescription(b, 'Grandma’s birthday cake', 'manual');
    addDescription(c, null, 'manual');
    addDescription(secret, 'harbour at night', 'file');
    const found = (text: string): readonly string[] => ids(alice, { filter: 'all', meaning: text });
    expect(found('harb')).toEqual([a]);
    expect(found('sunSET')).toEqual([a]);
    expect(found('cake harbour')).toEqual([b, a]);
    expect(found('100%')).toEqual([]);
    expect(ids(bob, { filter: 'all', meaning: 'harbour' })).toEqual([secret, a]);
  });

  it('falls back to words when meaning cannot be computed and asks again afterwards', async () => {
    const a = photo(1);
    addLabels(a, ['cat']);
    let calls = 0;
    const meaning: MeaningSource = {
      meaning: () => {
        calls += 1;
        return Promise.reject(new Error('offline'));
      },
    };
    let clock = 0;
    const search = new PhotoSearch(reader(), meaning, testLogger('photos'), () => clock);
    expect((await search.page(alice, MARCH, { filter: 'all', meaning: 'cat' })).ids).toEqual([a]);
    expect((await search.page(alice, MARCH, { filter: 'all', meaning: 'cat' })).ids).toEqual([a]);
    clock = 120_000;
    await search.page(alice, MARCH, { filter: 'all', meaning: 'cat' });
    expect(calls).toBe(3);
  });

  it('does not use meaning hits of photos the viewer cannot open', async () => {
    const secret = photo(1, BOB_ROOT);
    const meaning: MeaningSource = {
      meaning: () => Promise.resolve([{ itemId: secret, score: 0.9 }]),
    };
    const search = new PhotoSearch(reader(), meaning, testLogger('photos'), () => 0);
    expect((await search.page(alice, MARCH, { filter: 'all', meaning: 'x' })).ids).toEqual([]);
  });
});

describe('suggestions and counts', () => {
  it('suggests named people, pets, things and text, only from what the viewer can open', async () => {
    const [a, b, c] = [photo(1), photo(2), photo(3, BOB_ROOT)];
    addFace({ itemId: a, embedding: direction(0) });
    addFace({ itemId: b, embedding: direction(4), kind: 'pet', species: 'dog' });
    addFace({ itemId: c, embedding: direction(9) });
    addLabels(a, ['Sunset', 'sunflower']);
    addLabels(c, ['sunrise']);
    addText(a, 'Sunday market');
    addText(c, 'Sunken ship');
    const service = people();
    await service.regroup(alice.profileId, 'person');
    await service.regroup(alice.profileId, 'pet');
    for (const group of service.people(alice).groups)
      service.update(alice, group.id, { name: group.kind === 'pet' ? 'Sunny' : 'Susan' });
    const suggest = new PhotoSuggest(context, service, groups());
    const result = suggest.read(alice, 'su');
    expect(result.people.map((entry) => entry.name)).toEqual(['Susan']);
    expect(result.pets.map((entry) => entry.name)).toEqual(['Sunny']);
    expect(result.things.map((entry) => entry.label)).toEqual(['sunflower', 'sunset']);
    expect(result.text.map((entry) => entry.itemId)).toEqual([a]);
    expect(suggest.read(alice, 'zzz')).toEqual({ people: [], pets: [], things: [], text: [] });
    expect(suggest.read(bob, 'su').people).toEqual([]);
  });

  it('counts the visible, unhidden people and pets for the rail', async () => {
    const [a, b] = [photo(1), photo(2)];
    addFace({ itemId: a, embedding: direction(0) });
    addFace({ itemId: b, embedding: direction(7) });
    addFace({ itemId: b, embedding: direction(3), kind: 'pet', species: 'cat' });
    const service = people();
    await service.regroup(alice.profileId, 'person');
    await service.regroup(alice.profileId, 'pet');
    const total = (actor: DriveActor): number =>
      context.sql.get(z.strictObject({ total: z.int() }), PEOPLE_COUNT_SQL, {
        profile: actor.profileId,
      })?.total ?? -1;
    expect(total(alice)).toBe(3);
    expect(total(bob)).toBe(0);
    const [first] = service.people(alice).groups;
    service.update(alice, first?.id ?? '', { hidden: true });
    expect(total(alice)).toBe(2);
  });
});
