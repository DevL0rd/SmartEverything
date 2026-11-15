import { describe, expect, it } from 'vitest';
import type { DriveChange, DriveChangeResult, DriveShortcut } from '@smarteverything/domain';
import { AT, ROOT_ID } from '../data/fixtures';
import { entriesOf, shortcutNodeOf, type DriveNode } from './drive-node';
import { NOT_ALLOWED, NO_SHORTCUT_BACK, NO_TOP_MOVE, driveChangeOf, runDriveOp } from './drive-ops';
import { DRIVE_PLACES } from './drive-places';
import { locationKeyOf } from '../../files';
import { MINE, VIEWER_ID, createFakeDrive, idOf, worldContext } from './drive-fixture';

const MY_TOP = { place: DRIVE_PLACES.myDrive, folder: null };

function nodesOf(fake = createFakeDrive()): readonly DriveNode[] {
  return entriesOf(fake.childrenOf(null), [], worldContext());
}

describe('change bodies', () => {
  const fake = createFakeDrive();
  const [docs, , plan] = nodesOf(fake);
  if (docs === undefined || plan === undefined) throw new Error('the seed has entries');

  it('moves and copies into a folder', () => {
    const into = { place: DRIVE_PLACES.myDrive, folder: docs.key };
    expect(driveChangeOf({ kind: 'move', nodes: [plan], to: into }, fake.env)).toEqual({
      action: 'move',
      itemIds: [plan.key],
      toFolderId: docs.key,
    });
    expect(driveChangeOf({ kind: 'copy', nodes: [plan], to: into }, fake.env)).toEqual({
      action: 'copy',
      itemIds: [plan.key],
      toFolderId: docs.key,
    });
  });

  it('refuses a move or copy to the top of a drive or into the trash', () => {
    expect(driveChangeOf({ kind: 'move', nodes: [plan], to: MY_TOP }, fake.env)).toBe(NO_TOP_MOVE);
    expect(
      driveChangeOf(
        { kind: 'copy', nodes: [plan], to: { place: DRIVE_PLACES.trash, folder: null } },
        fake.env,
      ),
    ).toBe(NO_TOP_MOVE);
  });

  it('creates a folder at the top of a drive or inside a folder', () => {
    expect(driveChangeOf({ kind: 'new_folder', in: MY_TOP, name: 'New' }, fake.env)).toEqual({
      action: 'new_folder',
      parent: { kind: 'drive', rootId: MINE.id },
      name: 'New',
    });
    expect(
      driveChangeOf(
        { kind: 'new_folder', in: { place: DRIVE_PLACES.myDrive, folder: docs.key }, name: 'Sub' },
        fake.env,
      ),
    ).toEqual({
      action: 'new_folder',
      parent: { kind: 'folder', folderId: docs.key },
      name: 'Sub',
    });
  });

  it('refuses a new folder where nothing can be added', () => {
    const where = { place: DRIVE_PLACES.sharedWithMe, folder: null };
    expect(typeof driveChangeOf({ kind: 'new_folder', in: where, name: 'X' }, fake.env)).toBe(
      'string',
    );
  });

  it('maps renames, stars and trash actions by id', () => {
    const body = (
      kind: 'rename' | 'star' | 'unstar' | 'trash' | 'restore' | 'delete_now',
    ): DriveChange | string =>
      driveChangeOf(
        kind === 'rename' ? { kind, node: plan, name: 'Renamed' } : { kind, nodes: [plan] },
        fake.env,
      );
    expect(body('rename')).toEqual({ action: 'rename', itemId: plan.key, name: 'Renamed' });
    for (const kind of ['star', 'unstar', 'trash', 'restore', 'delete_now'] as const) {
      expect(body(kind)).toEqual({ action: kind, itemIds: [plan.key] });
    }
  });
});

describe('running changes', () => {
  it('trashes with an undo that restores the same items', async () => {
    const fake = createFakeDrive();
    const [, , plan] = nodesOf(fake);
    if (plan === undefined) throw new Error('the seed has entries');
    const result = await runDriveOp({ kind: 'trash', nodes: [plan] }, fake.env);
    expect(result.done).toEqual([plan.key]);
    expect(fake.items.has(plan.key)).toBe(false);
    if (result.undo === null) throw new Error('trash gives an undo');
    await result.undo();
    expect(fake.items.has(plan.key)).toBe(true);
    expect(fake.calls.map((call) => call.action)).toEqual(['trash', 'restore']);
  });

  it('moves an item back to the folder it came from on undo', async () => {
    const fake = createFakeDrive();
    const [docs, photos] = nodesOf(fake);
    const [notes] = entriesOf(fake.childrenOf(idOf(1)), [], worldContext());
    if (docs === undefined || photos === undefined || notes === undefined)
      throw new Error('the seed has entries');
    const result = await runDriveOp(
      { kind: 'move', nodes: [notes], to: { place: DRIVE_PLACES.myDrive, folder: photos.key } },
      fake.env,
    );
    expect(fake.items.get(notes.key)?.parentId).toBe(photos.key);
    if (result.undo === null) throw new Error('a move out of a folder gives an undo');
    const back = await result.undo();
    expect(back.failed).toEqual([]);
    expect(fake.items.get(notes.key)?.parentId).toBe(docs.key);
  });

  it('moves the copies to the Trash on undo of a copy', async () => {
    const fake = createFakeDrive();
    const [docs, , plan] = nodesOf(fake);
    if (docs === undefined || plan === undefined) throw new Error('the seed has entries');
    const result = await runDriveOp(
      { kind: 'copy', nodes: [plan], to: { place: DRIVE_PLACES.myDrive, folder: docs.key } },
      fake.env,
    );
    const copies = fake.childrenOf(docs.key).filter((item) => item.name === plan.name);
    expect(copies).toHaveLength(1);
    if (result.undo === null) throw new Error('a copy gives an undo');
    await result.undo();
    expect(fake.childrenOf(docs.key).filter((item) => item.name === plan.name)).toEqual([]);
    expect(fake.items.has(plan.key)).toBe(true);
  });

  it('keeps no undo for a move out of the top of a drive, which can’t be moved back', async () => {
    const fake = createFakeDrive();
    const [docs, , plan] = nodesOf(fake);
    if (docs === undefined || plan === undefined) throw new Error('the seed has entries');
    const result = await runDriveOp(
      { kind: 'move', nodes: [plan], to: { place: DRIVE_PLACES.myDrive, folder: docs.key } },
      fake.env,
    );
    expect(result).toMatchObject({ done: [plan.key], undo: null });
  });

  it('says what a restored item came back as, with Open going to it', async () => {
    const fake = createFakeDrive();
    const [, , plan] = nodesOf(fake);
    if (plan === undefined) throw new Error('the seed has entries');
    const trashed = await runDriveOp({ kind: 'trash', nodes: [plan] }, fake.env);
    expect(trashed.follow).toBeUndefined();
    const result = await runDriveOp({ kind: 'restore', nodes: [plan] }, fake.env);
    expect(result.follow?.message).toBe('Restored as Plan.pdf in My Drive');
    result.follow?.action?.onPress();
    expect(fake.opened).toEqual([plan.key]);
  });

  it('reports the created folder for a new folder', async () => {
    const fake = createFakeDrive();
    const result = await runDriveOp({ kind: 'new_folder', in: MY_TOP, name: 'Fresh' }, fake.env);
    expect(result.failed).toEqual([]);
    expect(result.done).toHaveLength(1);
    expect([...fake.items.values()].some((item) => item.name === 'Fresh')).toBe(true);
  });

  it('reports a clash as a failure with a reason', async () => {
    const fake = createFakeDrive();
    const [docs, , plan] = nodesOf(fake);
    if (docs === undefined || plan === undefined) throw new Error('the seed has entries');
    const env = {
      ...fake.env,
      change: (): Promise<DriveChangeResult> =>
        Promise.resolve({
          done: [],
          failed: [],
          conflicts: [{ itemId: plan.key, name: 'Plan.pdf', existingItemId: idOf(77) }],
        }),
    };
    const result = await runDriveOp(
      { kind: 'copy', nodes: [plan], to: { place: DRIVE_PLACES.myDrive, folder: docs.key } },
      env,
    );
    expect(result.done).toEqual([]);
    expect(result.failed).toEqual([{ key: plan.key, reason: '“Plan.pdf” already exists there.' }]);
  });

  it('turns a refused or thrown change into a failure instead of a success', async () => {
    const fake = createFakeDrive();
    const env = {
      ...fake.env,
      change: (): Promise<DriveChangeResult> => Promise.reject(new Error('The hub is away.')),
    };
    const created = await runDriveOp({ kind: 'new_folder', in: MY_TOP, name: 'X' }, env);
    expect(created).toEqual({
      done: [],
      failed: [{ key: `${locationKeyOf(MY_TOP)}\nX`, reason: 'The hub is away.' }],
      undo: null,
    });
    const [, , plan] = nodesOf(fake);
    if (plan === undefined) throw new Error('the seed has entries');
    const trashed = await runDriveOp({ kind: 'trash', nodes: [plan] }, env);
    expect(trashed.done).toEqual([]);
    expect(trashed.failed).toEqual([{ key: plan.key, reason: 'The hub is away.' }]);
  });

  it('refuses to change nodes the person may not change without calling the hub', async () => {
    const fake = createFakeDrive();
    const [, , plan] = nodesOf(fake);
    if (plan === undefined) throw new Error('the seed has entries');
    const locked = { ...plan, writable: false };
    const result = await runDriveOp({ kind: 'trash', nodes: [locked] }, fake.env);
    expect(result.done).toEqual([]);
    expect(fake.calls).toEqual([]);
  });
});

describe('changes to shortcuts beside items', () => {
  function withShortcuts(): {
    readonly fake: ReturnType<typeof createFakeDrive>;
    readonly plan: DriveNode;
    readonly docs: DriveNode;
    readonly alias: DriveNode;
    readonly gone: DriveNode;
  } {
    const fake = createFakeDrive();
    const [docs, , plan] = nodesOf(fake);
    const target = fake.items.get(idOf(4));
    if (docs === undefined || plan === undefined || target === undefined) {
      throw new Error('the seed has entries');
    }
    const base = { rootId: ROOT_ID, parentId: null, createdBy: VIEWER_ID, createdAt: AT };
    const live: DriveShortcut = {
      ...base,
      id: idOf(60),
      name: 'Alias',
      target: { state: 'available', item: target },
    };
    const lost: DriveShortcut = {
      ...base,
      id: idOf(61),
      name: 'Lost',
      target: { state: 'unavailable', reason: 'trashed' },
    };
    fake.addShortcut(live);
    fake.addShortcut(lost);
    return {
      fake,
      plan,
      docs,
      alias: shortcutNodeOf(live, worldContext()),
      gone: shortcutNodeOf(lost, worldContext()),
    };
  }

  it('moves the shortcuts themselves and the items by the change call', async () => {
    const { fake, plan, docs, alias, gone } = withShortcuts();
    const result = await runDriveOp(
      {
        kind: 'move',
        nodes: [alias, gone, plan],
        to: { place: DRIVE_PLACES.myDrive, folder: docs.key },
      },
      fake.env,
    );
    expect(result.failed).toEqual([]);
    expect([...result.done].sort()).toEqual([alias.key, gone.key, plan.key].sort());
    expect(fake.shortcuts.get(idOf(60))?.parentId).toBe(docs.key);
    expect(fake.shortcuts.get(idOf(61))?.parentId).toBe(docs.key);
    expect(fake.calls).toEqual([{ action: 'move', itemIds: [plan.key], toFolderId: docs.key }]);
  });

  it('puts moved shortcuts back where they were on undo', async () => {
    const { fake, docs, alias } = withShortcuts();
    const result = await runDriveOp(
      { kind: 'move', nodes: [alias], to: { place: DRIVE_PLACES.myDrive, folder: docs.key } },
      fake.env,
    );
    expect(fake.shortcuts.get(idOf(60))?.parentId).toBe(docs.key);
    if (result.undo === null) throw new Error('a shortcut move gives an undo');
    await result.undo();
    expect(fake.shortcuts.get(idOf(60))?.parentId).toBeNull();
  });

  it('removes trashed shortcuts and puts the available ones back on undo', async () => {
    const { fake, plan, alias, gone } = withShortcuts();
    const result = await runDriveOp({ kind: 'trash', nodes: [alias, gone, plan] }, fake.env);
    expect([...result.done].sort()).toEqual([alias.key, gone.key, plan.key].sort());
    expect(fake.shortcuts.size).toBe(0);
    expect(fake.items.has(plan.key)).toBe(false);
    if (result.undo === null) throw new Error('trash gives an undo');
    const back = await result.undo();
    expect(fake.items.has(plan.key)).toBe(true);
    expect([...fake.shortcuts.values()].map((shortcut) => shortcut.name)).toEqual(['Alias']);
    expect(back.failed).toEqual([{ key: gone.key, reason: NO_SHORTCUT_BACK }]);
  });

  it('renames a shortcut without renaming its target', async () => {
    const { fake, alias } = withShortcuts();
    const result = await runDriveOp({ kind: 'rename', node: alias, name: 'Renamed' }, fake.env);
    expect(result.done).toEqual([alias.key]);
    expect(fake.shortcuts.get(idOf(60))?.name).toBe('Renamed');
    expect(fake.calls).toEqual([]);
  });

  it('stars the target of an available shortcut and refuses an unavailable one', async () => {
    const { fake, plan, alias, gone } = withShortcuts();
    const result = await runDriveOp({ kind: 'star', nodes: [alias, gone, plan] }, fake.env);
    expect(fake.calls).toEqual([{ action: 'star', itemIds: [idOf(4), plan.key] }]);
    expect(result.failed).toEqual([{ key: gone.key, reason: NOT_ALLOWED }]);
  });
});
