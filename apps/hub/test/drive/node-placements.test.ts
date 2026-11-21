import type { DrivePlacement, DrivePlacementStatus, HubFrame } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SessionPlacements,
  type PlacementStateFrame,
} from '../../src/computers/computer-placements';
import { testLogger } from '../support/logs';
import {
  ROBIN_DRIVE,
  openPlacementWorld,
  place,
  status,
  type PlacementWorld,
} from './placement-fixture';

let world: PlacementWorld;
const opened: SessionPlacements[] = [];

beforeEach(async () => {
  world = await openPlacementWorld();
});

afterEach(async () => {
  opened.splice(0).forEach((session) => {
    session.close();
  });
  await world.close();
});

async function nextTick(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await Promise.all(opened.map((session) => session.settled()));
}

function stateFrame(
  placementId: string,
  fields: Partial<DrivePlacementStatus> = {},
): PlacementStateFrame {
  return { type: 'placement_state', placementId, ...status(fields) };
}

interface Link {
  readonly session: SessionPlacements;
  readonly sent: HubFrame[];
  readonly logged: string[];
  demand: boolean;
}

function link(): Link {
  const sent: HubFrame[] = [];
  const logged: string[] = [];
  const state = { demand: false };
  const log = testLogger();
  const session = new SessionPlacements({
    placements: world.placements,
    send: (frame): void => {
      sent.push(frame);
    },
    mountsDemanded: (): boolean => state.demand,
    log,
  });
  vi.spyOn(log, 'warn').mockImplementation((event) => {
    logged.push(event);
  });
  opened.push(session);
  return {
    session,
    sent,
    logged,
    get demand(): boolean {
      return state.demand;
    },
    set demand(value: boolean) {
      state.demand = value;
    },
  };
}

function frames(sent: readonly HubFrame[]): readonly (readonly string[])[] {
  return sent.flatMap((frame) =>
    frame.type === 'placements' ? [frame.placements.map((placement) => placement.id)] : [],
  );
}

function put(
  deviceId: string,
  owner: 'robin' | 'ida',
  fields: Parameters<typeof place>[3] = {},
): DrivePlacement {
  return place(world, world[owner], deviceId, fields);
}

describe('sending placements to a computer', () => {
  it('sends the active placements of the device when its session opens', async () => {
    const mine = put(world.robinDesk, 'robin');
    put(world.idaDesk, 'ida', { mountName: 'Games' });
    const { session, sent } = link();
    session.open(world.robinDesk);
    await session.settled();
    expect(frames(sent)).toEqual([[mine.id]]);
  });

  it('sends a replacement only to the device that changed', async () => {
    const robinLink = link();
    const idaLink = link();
    robinLink.session.open(world.robinDesk);
    await robinLink.session.settled();
    idaLink.session.open(world.idaDesk);
    await idaLink.session.settled();
    const placed = put(world.robinDesk, 'robin');
    await nextTick();
    expect(frames(robinLink.sent)).toEqual([[], [placed.id]]);
    expect(frames(idaLink.sent)).toEqual([[]]);
  });

  it('does not send held or disabled placements', async () => {
    const held = put(world.robinDesk, 'robin');
    const off = put(world.robinDesk, 'robin', { rootId: ROBIN_DRIVE, enabled: false });
    await nextTick();
    const { session, sent } = link();
    session.open(world.robinDesk);
    await session.settled();
    await world.placements.setHold(held.id, 'trashed');
    await nextTick();
    expect(off.enabled).toBe(false);
    expect(frames(sent)).toEqual([[held.id], []]);
  });

  it('stops sending after the session closes', async () => {
    const { session, sent } = link();
    session.open(world.robinDesk);
    await session.settled();
    session.close();
    put(world.robinDesk, 'robin');
    await nextTick();
    expect(frames(sent)).toEqual([[]]);
  });

  it('sends again on a repeated open without subscribing twice', async () => {
    const { session, sent } = link();
    session.open(world.robinDesk);
    await session.settled();
    session.open(world.robinDesk);
    await session.settled();
    put(world.robinDesk, 'robin');
    await nextTick();
    expect(sent).toHaveLength(3);
  });
});

describe('placement state from a computer', () => {
  it('stores the reported status of its own placement', async () => {
    const placed = put(world.robinDesk, 'robin');
    const { session } = link();
    session.open(world.robinDesk);
    await session.settled();
    session.received(stateFrame(placed.id, { state: 'mounted', route: 'remote' }));
    await session.settled();
    expect(world.store.drivePlacements.byId(placed.id).status).toMatchObject({
      state: 'mounted',
      route: 'remote',
      cacheBytes: 10,
    });
  });

  it('refuses and logs a placement of another computer', async () => {
    const foreign = put(world.idaDesk, 'ida', { mountName: 'Games' });
    const { session, logged } = link();
    session.open(world.robinDesk);
    await session.settled();
    session.received(stateFrame(foreign.id));
    await session.settled();
    expect(world.store.drivePlacements.byId(foreign.id).status.state).toBe('starting');
    expect(logged).toEqual(['computer.placement_state_refused']);
  });

  it('refuses and logs a placement that does not exist', async () => {
    const { session, logged } = link();
    session.open(world.robinDesk);
    await session.settled();
    session.received(stateFrame('0a0000ff-0000-4000-8000-000000000000'));
    await session.settled();
    expect(logged).toEqual(['computer.placement_state_refused']);
  });

  it('refuses a report before the session has opened', async () => {
    const placed = put(world.robinDesk, 'robin');
    const { session, logged } = link();
    session.received(stateFrame(placed.id));
    await session.settled();
    expect(world.store.drivePlacements.byId(placed.id).status.state).toBe('starting');
    expect(logged).toEqual(['computer.placement_state_before_hello']);
  });

  it('stores a state transition whether or not counters are demanded', async () => {
    const placed = put(world.robinDesk, 'robin');
    const rig = link();
    rig.session.open(world.robinDesk);
    await rig.session.settled();
    rig.session.received(stateFrame(placed.id, { state: 'mounted', cacheBytes: 5 }));
    await rig.session.settled();
    expect(world.store.drivePlacements.byId(placed.id).status).toMatchObject({
      state: 'mounted',
      cacheBytes: 5,
    });
  });

  it('stores counter-only changes only while the mounts view is demanded', async () => {
    const placed = put(world.robinDesk, 'robin');
    const rig = link();
    rig.session.open(world.robinDesk);
    await rig.session.settled();
    rig.session.received(
      stateFrame(placed.id, { state: 'starting', tier: null, route: null, cacheBytes: 0 }),
    );
    await rig.session.settled();
    rig.session.received(
      stateFrame(placed.id, { state: 'starting', tier: null, route: null, cacheBytes: 99 }),
    );
    await rig.session.settled();
    expect(world.store.drivePlacements.byId(placed.id).status.cacheBytes).toBe(0);
    rig.demand = true;
    rig.session.received(
      stateFrame(placed.id, { state: 'starting', tier: null, route: null, cacheBytes: 99 }),
    );
    await rig.session.settled();
    expect(world.store.drivePlacements.byId(placed.id).status.cacheBytes).toBe(99);
  });

  it('stores the status of a held placement it reported before the hold', async () => {
    const placed = put(world.robinDesk, 'robin');
    const { session } = link();
    session.open(world.robinDesk);
    await session.settled();
    await world.placements.setHold(placed.id, 'trashed');
    session.received(stateFrame(placed.id, { state: 'stopped', reason: 'Folder is in the trash' }));
    await session.settled();
    expect(world.store.drivePlacements.byId(placed.id).status.state).toBe('stopped');
  });

  it('stores the sync numbers and stores a new error or sync time as a transition', async () => {
    const placed = put(world.robinDesk, 'robin', { rootId: ROBIN_DRIVE, mode: 'synced' });
    const rig = link();
    rig.session.open(world.robinDesk);
    await rig.session.settled();
    const quiet = { state: 'up_to_date', tier: null, route: null, cacheBytes: 0 } as const;
    rig.session.received(stateFrame(placed.id, quiet));
    await rig.session.settled();
    rig.session.received(stateFrame(placed.id, { ...quiet, needBytes: 777 }));
    await rig.session.settled();
    expect(world.store.drivePlacements.byId(placed.id).status.needBytes).toBe(0);
    const errors = [{ relPath: 'a.txt', message: 'locked', at: '2026-11-08T00:00:00.000Z' }];
    rig.session.received(
      stateFrame(placed.id, {
        ...quiet,
        needBytes: 777,
        errors,
        lastSyncedAt: '2026-11-08T00:00:00.000Z',
      }),
    );
    await rig.session.settled();
    expect(world.store.drivePlacements.byId(placed.id).status).toMatchObject({
      needBytes: 777,
      errors,
      lastSyncedAt: '2026-11-08T00:00:00.000Z',
    });
  });
});
