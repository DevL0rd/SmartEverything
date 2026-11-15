import { describe, expect, it } from 'vitest';
import type { DriveShortcut } from '@smarteverything/domain';
import { pickedOf, selectAllOf, selectionActionsOf, type MenuContext } from '../../files';
import { AT, MEMBER_ID, ROOT_ID } from '../data/fixtures';
import { driveAbilitiesOf } from './drive-abilities';
import { driveActionsOf, type DriveActionEnv } from './drive-actions';
import { createFakeDrive, idOf, worldContext } from './drive-fixture';
import { entriesOf } from './drive-node';
import { DRIVE_PLACES } from './drive-places';

const ENV: DriveActionEnv = {
  online: true,
  phone: false,
  clientId: 'client',
  setOffline: () => Promise.resolve(null),
  setLock: () => Promise.resolve(null),
  removeShortcut: () => Promise.resolve(null),
  refresh: () => undefined,
  request: () => undefined,
};

const CONTEXT: MenuContext = {
  abilities: driveAbilitiesOf({
    place: DRIVE_PLACES.myDrive,
    atTop: true,
    access: 'own',
    online: true,
    phone: false,
  }),
  inTrash: false,
};

function shortcutTo(id: number, target: DriveShortcut['target']): DriveShortcut {
  return {
    id: idOf(id),
    rootId: ROOT_ID,
    parentId: null,
    name: `Shortcut ${String(id)}`,
    createdBy: MEMBER_ID,
    createdAt: AT,
    target,
  };
}

function barIdsOf(shortcuts: readonly DriveShortcut[]): readonly string[] {
  const fake = createFakeDrive();
  const nodes = entriesOf(fake.childrenOf(null), shortcuts, worldContext());
  const picked = pickedOf(nodes, selectAllOf(nodes.map((node) => node.key)));
  expect(picked).toHaveLength(nodes.length);
  const bar = selectionActionsOf(picked, CONTEXT, driveActionsOf(picked, ENV));
  return [...bar.actions, ...bar.danger].map((spec) => spec.id);
}

describe('selecting shortcuts beside items in My Drive', () => {
  it('keeps download, move and trash when everything is selected with a shortcut', () => {
    const target = createFakeDrive().items.get(idOf(3));
    if (target === undefined) throw new Error('the seed has entries');
    const ids = barIdsOf([shortcutTo(60, { state: 'available', item: target })]);
    expect(ids).toEqual(expect.arrayContaining(['download', 'move', 'copy', 'star', 'trash']));
  });

  it('keeps move and trash but not download beside an unavailable shortcut', () => {
    const ids = barIdsOf([shortcutTo(61, { state: 'unavailable', reason: 'trashed' })]);
    expect(ids).toEqual(expect.arrayContaining(['move', 'trash']));
    expect(ids).not.toContain('download');
  });
});
