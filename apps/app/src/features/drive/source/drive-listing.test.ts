import { describe, expect, it } from 'vitest';
import {
  DRIVE_SNIPPET_CLOSE,
  DRIVE_SNIPPET_OPEN,
  type DriveHit,
  type DriveItem,
  type DriveShortcut,
} from '@smarteverything/domain';
import { AT, ROOT_ID, documentFixture, driveItemFixture, folderFixture } from '../data/fixtures';
import {
  ancestorsOf,
  crumbsOf,
  driveQueryOf,
  driveSortOf,
  infoRowsOf,
  searchMatchesOf,
} from './drive-listing';
import { driveNodeOf, itemIdOf, trashNodeOf } from './drive-node';
import { DRIVE_PLACES, drivePlacesOf } from './drive-places';
import { OWNER_RIGHTS, HOME, MINE, VIEWER_ID, idOf, worldContext } from './drive-fixture';

describe('sort and query', () => {
  it('maps the browser sort onto the hub sort and leaves By to the client', () => {
    expect(driveSortOf({ field: 'name', direction: 'asc' })).toEqual({
      field: 'name',
      direction: 'asc',
    });
    expect(driveSortOf({ field: 'size', direction: 'desc' })).toEqual({
      field: 'bytes',
      direction: 'desc',
    });
    expect(driveSortOf({ field: 'modifiedAt', direction: 'desc' })).toEqual({
      field: 'modifiedAt',
      direction: 'desc',
    });
    expect(driveSortOf({ field: 'by', direction: 'asc' })).toBeNull();
  });

  it('asks the hub for names or for contents inside the folder', () => {
    const scope = { rootId: ROOT_ID, folderId: idOf(1) };
    expect(driveQueryOf({ text: ' plan ', contents: false }, scope)).toMatchObject({
      text: 'plan',
      match: 'names',
      rootId: ROOT_ID,
      folderId: idOf(1),
    });
    expect(driveQueryOf({ text: 'plan', contents: true }, scope).match).toBe('all');
    expect(driveQueryOf({ text: '  ', contents: true }, scope).text).toBeNull();
  });
});

describe('search matches', () => {
  const item = documentFixture({ id: idOf(2), name: 'Annual plan.pdf' });
  const query = { text: 'plan', contents: true };

  it('turns a name hit into highlighted ranges of the name', () => {
    const hit: DriveHit = { itemId: item.id, where: 'name', snippet: null };
    const [match] = searchMatchesOf(
      { items: [item], hits: [hit], shortcuts: [] },
      query,
      worldContext(),
    );
    expect(match?.hit).toEqual({
      where: 'name',
      snippet: null,
      line: null,
      ranges: [{ start: 7, end: 11 }],
    });
    expect(match?.node.key).toBe(item.id);
  });

  it('turns a content hit into a plain snippet with the marked ranges', () => {
    const hit: DriveHit = {
      itemId: item.id,
      where: 'text',
      snippet: `the ${DRIVE_SNIPPET_OPEN}plan${DRIVE_SNIPPET_CLOSE} is`,
    };
    const [match] = searchMatchesOf(
      { items: [item], hits: [hit], shortcuts: [] },
      query,
      worldContext(),
    );
    expect(match?.hit).toEqual({
      where: 'text',
      snippet: 'the plan is',
      line: null,
      ranges: [{ start: 4, end: 8 }],
    });
  });
});

describe('crumbs', () => {
  const places = drivePlacesOf([MINE, HOME], MINE.ownerProfileId);

  it('lists the places the person can reach', () => {
    expect(places.map((place) => place.key)).toEqual([
      DRIVE_PLACES.myDrive,
      DRIVE_PLACES.sharedDrive,
      DRIVE_PLACES.sharedWithMe,
      DRIVE_PLACES.trash,
    ]);
    expect(places.map((place) => place.label)).toEqual([
      'My Drive',
      'Shared Drive',
      'Shared with me',
      'Trash',
    ]);
  });

  it('starts at the place and ends at the folder, each crumb in its own location', () => {
    const top = folderFixture({
      id: idOf(3),
      name: 'Top',
      parentId: null,
      colour: 'viz-3',
      iconHint: true,
    });
    const folder = folderFixture({ id: idOf(4), name: 'Deep', parentId: top.id });
    const crumbs = crumbsOf(places[0], DRIVE_PLACES.myDrive, [top, folder], worldContext());
    expect(crumbs.map((crumb) => crumb.label)).toEqual(['My Drive', 'Top', 'Deep']);
    expect(crumbs[0]?.leading).toBeUndefined();
    expect(crumbs[1]?.leading?.marks).toMatchObject({ colour: 'viz-3', iconHint: true });
    expect(crumbs[2]?.leading?.kind).toBe('folder');
    expect(crumbs[1]?.location).toEqual({ place: DRIVE_PLACES.myDrive, folder: top.id });
    expect(crumbs[0]?.location).toEqual({ place: DRIVE_PLACES.myDrive, folder: null });
  });

  it('is just the place at the top', () => {
    const crumbs = crumbsOf(places[0], DRIVE_PLACES.myDrive, [], worldContext());
    expect(crumbs.map((crumb) => crumb.label)).toEqual(['My Drive']);
  });
});

describe('search shortcuts', () => {
  it('lists a matching shortcut as a row that opens its target', () => {
    const target = documentFixture({ id: idOf(8), name: 'Real plan.pdf' });
    const shortcut: DriveShortcut = {
      id: idOf(9),
      rootId: ROOT_ID,
      parentId: null,
      name: 'Plan shortcut',
      createdBy: VIEWER_ID,
      createdAt: AT,
      target: { state: 'available', item: target },
    };
    const found = { items: [], hits: [], shortcuts: [shortcut] };
    const [match] = searchMatchesOf(found, { text: 'plan', contents: false }, worldContext());
    expect(match?.node.name).toBe('Plan shortcut');
    expect(match?.hit.ranges).toEqual([{ start: 0, end: 4 }]);
    expect(match === undefined ? null : itemIdOf(match.node)).toBe(target.id);
  });
});

describe('ancestors', () => {
  const top = folderFixture({ id: idOf(5), name: 'A', parentId: null });
  const middle = folderFixture({ id: idOf(6), name: 'B', parentId: top.id });
  const leaf = folderFixture({ id: idOf(7), name: 'C', parentId: middle.id });
  const read = (id: string): Promise<DriveItem> => {
    const found = [top, middle, leaf].find((item) => item.id === id);
    return found === undefined ? Promise.reject(new Error('missing')) : Promise.resolve(found);
  };

  it('walks up to the top in order', async () => {
    expect((await ancestorsOf(leaf, read, null)).map((item) => item.name)).toEqual(['A', 'B']);
  });

  it('stops at the folder a person was given access to', async () => {
    expect((await ancestorsOf(leaf, read, middle.id)).map((item) => item.name)).toEqual(['B']);
  });
});

describe('info rows', () => {
  const facts = {
    when: (at: string): string => `at ${at}`,
    nameOf: (): string => 'Dana',
    rootLabelOf: (): string => 'My Drive',
  };

  it('describes a stored item', () => {
    const item = documentFixture({
      id: idOf(8),
      name: 'Plan.pdf',
      relPath: 'Docs/Plan.pdf',
      bytes: 2000,
      addedByProfileId: idOf(900),
    });
    const rows = infoRowsOf(driveNodeOf(item, worldContext()), facts);
    expect(rows.map((row) => row.key)).toEqual(['kind', 'size', 'modified', 'added', 'where']);
    expect(rows.find((row) => row.key === 'where')?.value).toBe('Docs');
    expect(rows.find((row) => row.key === 'added')?.value).toContain('Dana');
  });

  it('names a link and its target and a special file by its kind', () => {
    const link = driveItemFixture('link', { name: 'latest', linkTarget: 'Docs/plan.md' });
    const linkRows = infoRowsOf(driveNodeOf(link, worldContext()), facts);
    expect(linkRows.slice(0, 2)).toEqual([
      { key: 'kind', label: 'Kind', value: 'Link' },
      { key: 'target', label: 'Points to', value: 'Docs/plan.md' },
    ]);
    const fifo = driveItemFixture('special', { name: 'queue' });
    const fifoRows = infoRowsOf(driveNodeOf(fifo, worldContext()), facts);
    expect(fifoRows.slice(0, 2)).toEqual([
      { key: 'kind', label: 'Kind', value: 'Special file' },
      { key: 'what', label: 'What it is', value: 'Pipe, socket or device entry' },
    ]);
    expect(fifoRows.map((row) => row.key)).not.toContain('target');
  });

  it('describes a trashed item with where it was and when it goes', () => {
    const node = trashNodeOf(
      {
        itemId: idOf(9),
        rootId: ROOT_ID,
        name: 'old.png',
        originalRelPath: 'Pictures/old.png',
        trashRelPath: 't',
        isFolder: false,
        bytes: 70,
        deletedAt: AT,
        purgeAt: '2026-12-07T10:00:00.000Z',
        deletedBy: null,
        addedByProfileId: null,
      },
      OWNER_RIGHTS,
    );
    expect(infoRowsOf(node, facts).map((row) => row.key)).toEqual([
      'kind',
      'size',
      'was',
      'deleted',
      'purge',
    ]);
    expect(infoRowsOf(node, facts).find((row) => row.key === 'was')?.value).toBe(
      'My Drive › Pictures',
    );
  });
});
