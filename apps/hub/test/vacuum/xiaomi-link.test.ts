import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { XiaomiAdapter } from '../../src/adapters/xiaomi/adapter';
import { MapDownloadError } from '../../src/adapters/xiaomi/map-cloud';
import { VacuumLinkMissingError, VacuumLinkSlot } from '../../src/vacuum/link';
import { createWorld, destroyWorld, startAdapter, type World } from '../xiaomi/world';

let world: World;

beforeEach(async () => {
  world = await createWorld();
});

afterEach(async () => {
  await destroyWorld(world);
});

describe('the vacuum link of the Xiaomi adapter', () => {
  it('binds the slot so a robot reaches its own link and the map cloud no longer refuses', async () => {
    const adapter = await startAdapter(world);
    if (!(adapter instanceof XiaomiAdapter)) throw new Error('The Xiaomi adapter was not built.');
    await adapter.discover();
    const slot = new VacuumLinkSlot();
    expect(slot.io('100001')).toBeNull();
    expect(() => slot.cloud.download('https://fds.vacuum.test/map')).toThrow(
      VacuumLinkMissingError,
    );
    slot.bind(adapter.vacuumLink());
    expect(slot.io('100001')?.transport).toBe('lan');
    expect(slot.io('unknown')).toBeNull();
    await expect(slot.cloud.download('http://fds.vacuum.test/map')).rejects.toBeInstanceOf(
      MapDownloadError,
    );
  });
});
