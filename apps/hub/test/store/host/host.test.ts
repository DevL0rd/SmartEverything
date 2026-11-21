import type { LiveChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StoreNotFoundError } from '../../../src/store/context';
import { testStore, type TestStore } from '../../support/store';
import { personalDriveRoot } from '../drive-roots-fixture';

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('the store host', () => {
  it('runs a repository write in its own thread and delivers the change on the main feed', async () => {
    const { store } = opened;
    const changes: LiveChange[] = [];
    store.feed.subscribe((change) => changes.push(change));
    const room = await store.host.call('rooms', 'create', 'Kitchen', 0);
    expect(room.name).toBe('Kitchen');
    expect(store.rooms.list().map((row) => row.id)).toEqual([room.id]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ table: 'rooms', operation: 'INSERT', seq: store.feed.seq });
  });

  it('places drive folders inside the host from the layout it was given', async () => {
    const { store, layout } = opened;
    const owner = store.profiles.create({ name: 'Robin' }).id;
    const root = await store.host.call(
      'driveRoots',
      'insert',
      personalDriveRoot('0d000000-0000-4000-8000-0000000000a1', owner),
    );
    expect(root.path).toBe(layout.person(owner).drive);
    expect(store.driveRoots.byId(root.id).path).toBe(root.path);
  });

  it('reads what the main connection committed and clears its caches on main commits', async () => {
    const { store } = opened;
    expect(await store.host.call('settingsKv', 'read', 'probe')).toBeNull();
    store.settingsKv.save('probe', { on: true });
    expect(await store.host.call('settingsKv', 'read', 'probe')).toEqual({ on: true });
  });

  it('clears the main caches when the host commits', async () => {
    const { store } = opened;
    expect(store.settingsKv.read('probe')).toBeNull();
    await store.host.call('settingsKv', 'save', 'probe', { on: false });
    expect(store.settingsKv.read('probe')).toEqual({ on: false });
  });

  it('rebuilds the store errors on the main thread', async () => {
    await expect(opened.store.host.call('rooms', 'byId', 'missing')).rejects.toBeInstanceOf(
      StoreNotFoundError,
    );
  });
});
