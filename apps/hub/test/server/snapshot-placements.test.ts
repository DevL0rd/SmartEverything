import { SNAPSHOT_TABLES } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ownDrivePlacements } from '../../src/server/snapshot-tables';
import { openPlacementWorld, type PlacementWorld } from '../drive/placement-fixture';

let world: PlacementWorld;

beforeEach(async () => {
  world = await openPlacementWorld();
});

afterEach(async () => {
  await world.close();
});

describe('the drive placements in the snapshot', () => {
  it('carry the mount a person turned on, so a reconnecting app still shows it on', async () => {
    const mounted = await world.placements.setMount(world.robin, {
      deviceId: world.robinDesk,
      enabled: true,
    });
    const rows = ownDrivePlacements(world.store, world.robin);
    expect(rows).toStrictEqual([mounted]);
    expect(rows).toStrictEqual(await world.placements.list(world.robin));
  });

  it('carry every placement of the person’s computers and none of anyone else’s', async () => {
    const robinMount = await world.placements.setMount(world.robin, {
      deviceId: world.robinDesk,
      enabled: true,
    });
    const secondMount = await world.placements.setMount(world.robin, {
      deviceId: world.secondRobinDesk,
      enabled: false,
    });
    await world.placements.setMount(world.ida, { deviceId: world.idaDesk, enabled: true });
    const ids = ownDrivePlacements(world.store, world.robin)
      .map((placement) => placement.id)
      .sort();
    expect(ids).toStrictEqual([robinMount.id, secondMount.id].sort());
  });

  it('are a table the snapshot schema requires', () => {
    expect(SNAPSHOT_TABLES.shape.drive_placements.safeParse(undefined).success).toBe(false);
  });
});
