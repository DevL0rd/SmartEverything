import type { RowChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

function computer(): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'computer-desk',
      parentId: null,
      kind: 'computer',
      name: 'Desk',
      model: 'm',
      manufacturer: 'm',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  return row?.id ?? '';
}

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('the ear host setting', () => {
  it('is unset for a home that never chose', () => {
    expect(opened.store.settings.read().ear_host_device_id).toBeNull();
  });

  it('keeps the chosen computer, announces the change and can be cleared', () => {
    const id = computer();
    const changes: RowChange[] = [];
    opened.store.feed.subscribe((change) => changes.push(change));
    expect(opened.store.settings.setEarHost(id).ear_host_device_id).toBe(id);
    expect(opened.store.settings.read().ear_host_device_id).toBe(id);
    expect(changes.at(-1)).toMatchObject({
      table: 'settings',
      operation: 'UPDATE',
      record: { ear_host_device_id: id },
    });
    expect(opened.store.settings.setEarHost(null).ear_host_device_id).toBeNull();
  });

  it('refuses a device that does not exist', () => {
    expect(() => opened.store.settings.setEarHost(crypto.randomUUID())).toThrow();
  });

  it('forgets the choice when that computer is removed', () => {
    const id = computer();
    opened.store.settings.setEarHost(id);
    opened.store.devices.remove([id]);
    expect(opened.store.settings.read().ear_host_device_id).toBeNull();
  });
});
