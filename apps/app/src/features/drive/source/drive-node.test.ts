import { describe, expect, it } from 'vitest';
import {
  DRIVE_ITEM,
  type DriveShortcut,
  type DriveTrashEntry,
  type DriveSharedWithMeEntry,
} from '@smarteverything/domain';
import {
  AT,
  FOLDER_ID,
  MEMBER_ID,
  OTHER_ROOT_ID,
  OWNER_ID,
  ROOT_ID,
  audioFixture,
  documentFixture,
  driveItemFixture,
  folderFixture,
  imageFixture,
  otherFixture,
  videoFixture,
} from '../data/fixtures';
import { menuOf } from '../../files';
import { driveAbilitiesOf } from './drive-abilities';
import { HOME, MINE, VIEWER_ID, idOf, worldContext } from './drive-fixture';
import { DRIVE_PLACES } from './drive-places';
import {
  driveInfoIdsOf,
  driveNodeOf,
  driveTabIdsOf,
  entriesOf,
  itemIdOf,
  openTargetOf,
  shortcutNodeOf,
  trashNodeOf,
  type DriveNode,
  type DriveNodeContext,
} from './drive-node';

const FILE = documentFixture({ id: idOf(10), name: 'Plan.pdf' });

describe('node kinds', () => {
  it('maps every Drive item kind to a file node kind', () => {
    const context = worldContext();
    const kinds = [
      folderFixture({ id: idOf(11) }),
      imageFixture({ id: idOf(12) }),
      videoFixture({ id: idOf(13) }),
      audioFixture({ id: idOf(14) }),
      documentFixture({ id: idOf(15) }),
      otherFixture({ id: idOf(16), name: 'x.bin' }),
      otherFixture({ id: idOf(17), name: 'Backup.zip', mime: 'application/zip' }),
      documentFixture({ id: idOf(18), name: 'Pack.zip', mime: 'application/zip' }),
    ].map((item) => driveNodeOf(item, context).kind);
    expect(kinds).toEqual([
      'folder',
      'image',
      'video',
      'audio',
      'document',
      'other',
      'archive',
      'archive',
    ]);
  });

  it('maps a link and a special file to entry nodes that say what they are', () => {
    const base = folderFixture({ id: idOf(19), name: 'ln' });
    const link = DRIVE_ITEM.parse({
      id: base.id,
      rootId: base.rootId,
      parentId: base.parentId,
      relPath: 'ln',
      name: 'ln',
      modifiedAt: AT,
      addedAt: AT,
      openedAt: null,
      starred: false,
      shared: false,
      locked: false,
      lockedHere: false,
      openComments: 0,
      rev: 1,
      etag: 'e',
      outside: false,
      addedByProfileId: null,
      remoteId: null,
      remoteRev: null,
      kind: 'link',
      bytes: 0,
      linkTarget: '/elsewhere',
    });
    const node = driveNodeOf(link, worldContext());
    expect(node).toMatchObject({
      kind: 'link',
      mime: null,
      size: null,
      exportable: false,
      writable: true,
      entry: {
        line: 'Points to /elsewhere',
        stays: 'It stays on the drive and cannot be opened or downloaded.',
      },
    });
    const fifo = driveNodeOf(
      driveItemFixture('special', { id: idOf(23), name: 'queue' }),
      worldContext(),
    );
    expect(fifo).toMatchObject({
      kind: 'special',
      mime: null,
      size: null,
      exportable: false,
      writable: false,
      entry: {
        line: 'Pipe, socket or device entry',
        stays: 'It stays on the drive and cannot be opened or downloaded.',
      },
    });
  });

  it('gives a content file no entry note', () => {
    expect(driveNodeOf(FILE, worldContext()).entry).toBeNull();
  });
});

describe('node fields', () => {
  it('carries size, mime, parent and the hidden flag', () => {
    const node = driveNodeOf(
      documentFixture({ id: idOf(20), name: '.secret.txt', bytes: 900, parentId: idOf(1) }),
      worldContext(),
    );
    expect(node).toMatchObject({
      key: idOf(20),
      parentKey: idOf(1),
      mime: 'application/pdf',
      size: 900,
      hidden: true,
      childCount: null,
    });
  });

  it('gives folders a child count and the recursive files and bytes they hold', () => {
    const node = driveNodeOf(
      folderFixture({
        id: idOf(21),
        childCount: 4,
        bytes: 12_000,
        totalBytes: 9_000_000,
        totalFiles: 340,
      }),
      worldContext(),
    );
    expect(node).toMatchObject({ kind: 'folder', childCount: 4, files: 340, size: 9_000_000 });
  });

  it('maps every mark', () => {
    const folder = folderFixture({
      id: idOf(22),
      starred: true,
      shared: true,
      locked: true,
      openComments: 3,
      colour: 'viz-3',
      iconHint: true,
    });
    const context: DriveNodeContext = worldContext({
      offline: new Map([[folder.id, 'ready']]),
      placements: new Map([[folder.id, 'mounted']]),
    });
    expect(driveNodeOf(folder, context).marks).toEqual({
      starred: true,
      shared: true,
      locked: true,
      comments: 3,
      offline: 'ready',
      shortcut: null,
      placement: 'mounted',
      colour: 'viz-3',
      iconHint: true,
    });
  });

  it('keeps files without a colour or icon hint', () => {
    expect(driveNodeOf(FILE, worldContext()).marks).toMatchObject({
      colour: null,
      iconHint: false,
    });
  });
});

describe('access', () => {
  it('lets the owner write and export everything', () => {
    const node = driveNodeOf(documentFixture({ id: idOf(30), locked: true }), worldContext());
    expect(node).toMatchObject({ writable: true, exportable: true });
  });

  it('lets a view grantee open a locked file but not export it', () => {
    const foreign = documentFixture({ id: idOf(31), rootId: OTHER_ROOT_ID, locked: true });
    const context = worldContext({ roots: [MINE], shared: [] });
    expect(driveNodeOf(foreign, context)).toMatchObject({ writable: false, exportable: false });
  });

  it('exports an unlocked file to a viewer and writes only with an edit grant', () => {
    const top = folderFixture({ id: idOf(32), rootId: idOf(900), relPath: 'Top', parentId: null });
    const file = documentFixture({
      id: idOf(33),
      rootId: idOf(900),
      relPath: 'Top/a.pdf',
      parentId: top.id,
    });
    const grant = (role: 'view' | 'edit'): DriveSharedWithMeEntry => ({
      item: top,
      grant: {
        id: idOf(40),
        itemId: top.id,
        profileId: OWNER_ID,
        role,
        grantedBy: MEMBER_ID,
        createdAt: AT,
        expiresAt: null,
      },
    });
    const viewing = worldContext({ roots: [MINE], shared: [grant('view')] });
    const editing = worldContext({ roots: [MINE], shared: [grant('edit')] });
    expect(driveNodeOf(file, viewing)).toMatchObject({ writable: false, exportable: true });
    expect(driveNodeOf(file, editing)).toMatchObject({ writable: true, exportable: true });
  });
});

function shortcutOf(target: DriveShortcut['target']): DriveShortcut {
  return {
    id: idOf(50),
    rootId: ROOT_ID,
    parentId: FOLDER_ID,
    name: 'Alias',
    createdBy: MEMBER_ID,
    createdAt: AT,
    target,
  };
}

describe('shortcuts', () => {
  it('shows an available shortcut as its target under the shortcut name, movable itself', () => {
    const node = shortcutNodeOf(
      shortcutOf({ state: 'available', item: documentFixture({ id: idOf(51), name: 'Real.pdf' }) }),
      worldContext(),
    );
    expect(node).toMatchObject({
      key: `shortcut:${idOf(50)}`,
      name: 'Alias',
      kind: 'document',
      writable: true,
      exportable: true,
      parentKey: FOLDER_ID,
    });
    expect(node.marks.shortcut).toEqual({ unavailable: null });
    expect(node.origin.kind).toBe('shortcut');
  });

  it('takes whether it can be exported from its target', () => {
    const node = shortcutNodeOf(
      shortcutOf({
        state: 'available',
        item: driveItemFixture('special', { id: idOf(55), name: 'Pipe' }),
      }),
      worldContext(),
    );
    expect(node.exportable).toBe(false);
  });

  it('says why an unavailable shortcut cannot be opened', () => {
    const node = shortcutNodeOf(
      shortcutOf({ state: 'unavailable', reason: 'trashed' }),
      worldContext(),
    );
    expect(node.key).toBe(`shortcut:${idOf(50)}`);
    expect(node.marks.shortcut).toEqual({ unavailable: 'The original is in the trash' });
    expect(node.kind).toBe('link');
  });

  it('lists shortcuts first and keeps one beside its target under its own key', () => {
    const target = documentFixture({ id: idOf(52), name: 'Beside.pdf' });
    const other = documentFixture({ id: idOf(53), name: 'Other.pdf' });
    const beside = shortcutOf({ state: 'available', item: target });
    const away = { ...shortcutOf({ state: 'available', item: other }), id: idOf(54), name: 'Away' };
    const entries = entriesOf([target], [beside, away], worldContext());
    expect(entries.map((node) => node.name)).toEqual(['Alias', 'Away', 'Beside.pdf']);
    expect(new Set(entries.map((node) => node.key)).size).toBe(3);
    expect(entries[0]?.origin).toMatchObject({ kind: 'shortcut', target: { key: idOf(52) } });
  });

  it('opens an available shortcut through its target and an unavailable one as itself', () => {
    const target = documentFixture({ id: idOf(52), name: 'Beside.pdf' });
    const live = shortcutNodeOf(shortcutOf({ state: 'available', item: target }), worldContext());
    expect(openTargetOf(live).key).toBe(idOf(52));
    expect(itemIdOf(live)).toBe(idOf(52));
    const gone = shortcutNodeOf(
      shortcutOf({ state: 'unavailable', reason: 'trashed' }),
      worldContext(),
    );
    expect(openTargetOf(gone)).toBe(gone);
  });
});

describe('trash entries', () => {
  function trashed(rootId: string, deletedBy: string | null): DriveTrashEntry {
    return {
      itemId: idOf(60),
      rootId,
      name: 'old.png',
      originalRelPath: 'Pictures/old.png',
      trashRelPath: '.trash/old.png',
      isFolder: false,
      bytes: 70,
      deletedAt: AT,
      purgeAt: '2026-12-07T10:00:00.000Z',
      deletedBy,
      addedByProfileId: null,
    };
  }

  const member = { owner: false, viewerId: VIEWER_ID, roots: [MINE, HOME] };

  it('lets a member delete for good only their own drive’s trash and what they deleted', () => {
    expect(trashNodeOf(trashed(ROOT_ID, null), member).deletable).toBe(true);
    expect(trashNodeOf(trashed(OTHER_ROOT_ID, VIEWER_ID), member).deletable).toBe(true);
    expect(trashNodeOf(trashed(OTHER_ROOT_ID, idOf(99)), member).deletable).toBe(false);
    expect(trashNodeOf(trashed(OTHER_ROOT_ID, null), member).deletable).toBe(false);
    expect(
      trashNodeOf(trashed(OTHER_ROOT_ID, idOf(99)), { ...member, owner: true }).deletable,
    ).toBe(true);
  });

  it('offers delete for good on a mixed selection only when every item allows it', () => {
    const own = trashNodeOf(trashed(ROOT_ID, null), member);
    const other = trashNodeOf(trashed(OTHER_ROOT_ID, idOf(99)), member);
    const abilities = driveAbilitiesOf({
      place: DRIVE_PLACES.trash,
      atTop: true,
      access: 'own',
      online: true,
      phone: false,
    });
    const context = { abilities, inTrash: true };
    const ids = (nodes: readonly DriveNode[]): readonly string[] =>
      menuOf(nodes, context, []).map((spec) => spec.id);
    expect(ids([own])).toContain('deleteNow');
    expect(ids([other])).not.toContain('deleteNow');
    expect(ids([other])).toContain('restore');
    expect(ids([own, other])).not.toContain('deleteNow');
    expect(ids([own, other])).toContain('restore');
  });

  it('maps a trashed item to a writable node that cannot be exported', () => {
    const node = trashNodeOf(trashed(ROOT_ID, null), member);
    expect(node).toMatchObject({
      key: idOf(60),
      kind: 'image',
      size: 70,
      modifiedAt: AT,
      writable: true,
      exportable: false,
    });
  });
});

describe('details tabs', () => {
  it('gives files four tabs and folders three', () => {
    const context = worldContext();
    expect(driveTabIdsOf(driveNodeOf(FILE, context))).toEqual([
      'comments',
      'versions',
      'activity',
      'sharing',
    ]);
    expect(driveTabIdsOf(driveNodeOf(folderFixture({ id: idOf(70) }), context))).toEqual([
      'comments',
      'activity',
      'sharing',
    ]);
  });

  it('gives trash entries and unavailable shortcuts none', () => {
    const node = shortcutNodeOf(
      shortcutOf({ state: 'unavailable', reason: 'no_access' }),
      worldContext(),
    );
    expect(driveTabIdsOf(node)).toEqual([]);
  });
});

describe('info sections', () => {
  it('gives files the audience, computers and edits sections and folders the colour row', () => {
    const context = worldContext();
    expect(driveInfoIdsOf(driveNodeOf(FILE, context))).toEqual(['access', 'computers', 'edits']);
    expect(driveInfoIdsOf(driveNodeOf(folderFixture({ id: idOf(71) }), context))).toEqual([
      'access',
      'colour',
      'computers',
    ]);
  });

  it('gives unavailable shortcuts none', () => {
    const node = shortcutNodeOf(
      shortcutOf({ state: 'unavailable', reason: 'no_access' }),
      worldContext(),
    );
    expect(driveInfoIdsOf(node)).toEqual([]);
  });
});
