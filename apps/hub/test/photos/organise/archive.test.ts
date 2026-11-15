import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArchiveService } from '../../../src/photos/organise/archive';
import { OrganisePages } from '../../../src/photos/organise/pages';
import { libraryVisible, photoVisible } from '../../../src/photos/membership';
import { openKit, type Kit } from './fixture';

let kit: Kit;
let archive: ArchiveService;
let pages: OrganisePages;

beforeEach(async () => {
  kit = await openKit();
  archive = new ArchiveService(kit.store);
  pages = new OrganisePages(kit.store.context, () => 'UTC');
});
afterEach(async () => {
  await kit.test.close();
});

describe('archive', () => {
  it('takes photos out of the Library but not out of everything else', () => {
    const kept = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const hidden = kit.seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z' });
    expect(archive.archive(kit.alice, { itemIds: [hidden] })).toEqual({ count: 1 });
    expect(kit.shown(libraryVisible(kit.alice))).toEqual([kept]);
    expect(kit.shown(photoVisible(kit.alice))).toEqual([kept, hidden]);
    expect(kit.notices).toMatchObject([{ type: 'drive_changed', months: ['2026-03'] }]);
  });

  it('counts only what changed and brings photos back', () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    expect(archive.archive(kit.alice, { itemIds: [id, id] })).toEqual({ count: 1 });
    expect(archive.archive(kit.alice, { itemIds: [id] })).toEqual({ count: 0 });
    expect(kit.notices).toHaveLength(1);
    expect(archive.unarchive(kit.alice, { itemIds: [id] })).toEqual({ count: 1 });
    expect(kit.shown(libraryVisible(kit.alice))).toEqual([id]);
  });

  it('archives per person: the same shared photo stays in the other Library', () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    archive.archive(kit.alice, { itemIds: [id] });
    expect(kit.shown(libraryVisible(kit.alice))).toEqual([]);
    expect(kit.shown(libraryVisible(kit.bob))).toEqual([id]);
    expect(pages.archiveBuckets(kit.bob, { filter: 'all' })).toEqual([]);
  });

  it('says per person whether a photo is archived and hides photos the caller cannot see', () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const theirs = kit.seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', root: kit.bobRoot });
    expect(archive.archived(kit.alice, id)).toEqual({ archived: false });
    archive.archive(kit.alice, { itemIds: [id] });
    expect(archive.archived(kit.alice, id)).toEqual({ archived: true });
    expect(archive.archived(kit.bob, id)).toEqual({ archived: false });
    expect(() => archive.archived(kit.alice, theirs)).toThrow();
  });

  it('refuses photos the caller cannot see and changes nothing', () => {
    const mine = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const theirs = kit.seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z', root: kit.bobRoot });
    expect(() => archive.archive(kit.alice, { itemIds: [mine, theirs] })).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    expect(kit.store.photoArchive.count(kit.alice.profileId)).toBe(0);
  });

  it('lists archived photos by month and page with the Library shape', () => {
    const first = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    const second = kit.seed({ n: 2, takenAt: '2026-03-02T10:00:00.000Z' });
    kit.seed({ n: 3, takenAt: '2026-02-02T10:00:00.000Z' });
    archive.archive(kit.alice, { itemIds: [first, second] });
    expect(pages.archiveBuckets(kit.alice, { filter: 'all' })).toEqual([
      { month: '2026-03', count: 2 },
    ]);
    const page = pages.archivePage(kit.alice, '2026-03', { filter: 'all' });
    expect(page.ids).toEqual([second, first]);
    expect(page.next).toBeNull();
    expect(pages.archivePage(kit.alice, '2026-02', { filter: 'all' }).ids).toEqual([]);
  });

  it('narrows archived pages with the Library scope', () => {
    const id = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z' });
    archive.archive(kit.alice, { itemIds: [id] });
    expect(pages.archiveBuckets(kit.alice, { filter: 'videos' })).toEqual([]);
    expect(pages.archiveBuckets(kit.alice, { filter: 'all', from: '2026-04-01' })).toEqual([]);
  });
});
