import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceUpsert } from '../../src/database/port';
import { deviceNames, placedDevices } from '../../src/extensions/mcp/tools/targets';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function light(externalId: string, roomId: string): DeviceUpsert {
  return {
    provider: 'xiaomi',
    externalId,
    parentId: null,
    kind: 'light',
    name: 'Light 3',
    model: 'model.one',
    manufacturer: 'Maker',
    providerRoom: null,
    roomId,
    online: true,
    capabilities: [],
    details: {},
  };
}

describe('device names in the AI tools', () => {
  it('shows the stored name verbatim in every room, never prefixed with the room', () => {
    const outdoor = opened.store.rooms.create('Outdoor', 0);
    const hall = opened.store.rooms.create('Hall', 1);
    opened.store.devices.upsert([light('a', outdoor.id), light('b', hall.id)]);
    const names = [...deviceNames(opened.store).values()];
    expect(names).toStrictEqual(['Light 3', 'Light 3']);
    expect(placedDevices(opened.store, null).map((placed) => placed.name)).toStrictEqual([
      'Light 3',
      'Light 3',
    ]);
    expect(placedDevices(opened.store, null).map((placed) => placed.room?.name)).toStrictEqual([
      'Outdoor',
      'Hall',
    ]);
  });

  it('shows a renamed device by its exact display name', () => {
    const outdoor = opened.store.rooms.create('Outdoor', 0);
    const [row] = opened.store.devices.upsert([light('a', outdoor.id)]);
    expect(row).toBeDefined();
    if (row === undefined) return;
    opened.store.devices.update(row.id, { display_name: 'Porch' });
    expect(deviceNames(opened.store).get(row.id)).toBe('Porch');
  });
});
