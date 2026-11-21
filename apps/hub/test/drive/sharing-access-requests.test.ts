import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemAccess } from '../../src/drive/access';
import { DriveAccessRequests } from '../../src/drive/sharing/access-requests';
import { MUSIC, ROBIN_TRIP, openPlacementWorld, type PlacementWorld } from './placement-fixture';

const IN_A_DAY = '2026-11-08T00:00:00.000Z';

let world: PlacementWorld;
let requests: DriveAccessRequests;

function accessOf(profileId: string, itemId: string): ReturnType<typeof itemAccess> {
  const { store } = world;
  const item = store.driveItems.byId(itemId, profileId);
  return itemAccess(store, { profileId }, store.driveRoots.byId(item.rootId), item);
}

function inbox(profileId: string): ReturnType<typeof world.store.driveNotifications.list> {
  return world.store.driveNotifications.list(profileId, null, 20);
}

beforeEach(async () => {
  world = await openPlacementWorld();
  requests = new DriveAccessRequests({ store: world.store });
});

afterEach(async () => {
  await world.close();
});

describe('opening an item from a people link', () => {
  it('returns the item and the level for a person who has access', async () => {
    const opened = await requests.open(world.robin, ROBIN_TRIP);
    expect(opened).toMatchObject({ access: 'own', item: { id: ROBIN_TRIP } });
  });

  it('returns only whether it can be requested to a person without access, never the name', async () => {
    const opened = await requests.open(world.ida, ROBIN_TRIP);
    expect(opened).toEqual({ access: 'none', requestable: true, pendingRequest: null });
    expect(JSON.stringify(opened)).not.toContain('Trip');
  });

  it('answers the same way to an id that does not exist, without a request to make', async () => {
    const opened = await requests.open(world.ida, '0f000000-0000-4000-8000-0000000000ff');
    expect(opened).toEqual({ access: 'none', requestable: false, pendingRequest: null });
  });

  it('shows the person their own pending request still without the name', async () => {
    const made = await requests.request(world.ida, {
      itemId: ROBIN_TRIP,
      role: 'view',
      message: null,
    });
    const opened = await requests.open(world.ida, ROBIN_TRIP);
    expect(opened).toMatchObject({
      access: 'none',
      pendingRequest: { id: made.id, itemName: null, state: 'pending' },
    });
  });

  it('opens the item directly once access exists', async () => {
    world.store.driveGrants.set(
      { itemId: ROBIN_TRIP, profileId: world.ida.profileId, role: 'view', expiresAt: null },
      world.robin.profileId,
    );
    expect(await requests.open(world.ida, ROBIN_TRIP)).toMatchObject({ access: 'view' });
  });
});

describe('asking for access', () => {
  it('records the request and tells the owner once', async () => {
    const made = await requests.request(world.ida, {
      itemId: ROBIN_TRIP,
      role: 'edit',
      message: 'For the trip photos',
    });
    expect(made).toMatchObject({
      state: 'pending',
      role: 'edit',
      message: 'For the trip photos',
      requesterProfileId: world.ida.profileId,
      ownerProfileId: world.robin.profileId,
      itemName: null,
    });
    const rows = inbox(world.robin.profileId).notifications;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'access_requested',
      itemId: ROBIN_TRIP,
      actorProfileId: world.ida.profileId,
      refId: made.id,
    });
  });

  it('returns the waiting request instead of making a second one', async () => {
    const first = await requests.request(world.ida, {
      itemId: ROBIN_TRIP,
      role: 'view',
      message: null,
    });
    const again = await requests.request(world.ida, {
      itemId: ROBIN_TRIP,
      role: 'view',
      message: null,
    });
    expect(again.id).toBe(first.id);
    expect((await requests.list(world.robin, 'waiting', undefined)).items).toHaveLength(1);
  });

  it('refuses a request for access the person already has, but allows an upgrade', async () => {
    world.store.driveGrants.set(
      { itemId: ROBIN_TRIP, profileId: world.ida.profileId, role: 'view', expiresAt: null },
      world.robin.profileId,
    );
    await expect(
      requests.request(world.ida, { itemId: ROBIN_TRIP, role: 'view', message: null }),
    ).rejects.toThrow(/already have/u);
    expect(
      (await requests.request(world.ida, { itemId: ROBIN_TRIP, role: 'edit', message: null }))
        .state,
    ).toBe('pending');
  });

  it('refuses a request for the Shared Drive and for an item that does not exist', async () => {
    await expect(
      requests.request(world.ida, { itemId: MUSIC, role: 'view', message: null }),
    ).rejects.toThrow(/Shared Drive/u);
    await expect(
      requests.request(world.ida, {
        itemId: '0f000000-0000-4000-8000-0000000000ff',
        role: 'view',
        message: null,
      }),
    ).rejects.toThrow(/no such/u);
  });

  it('lists what a person asked for and what waits for the owner', async () => {
    const made = await requests.request(world.ida, {
      itemId: ROBIN_TRIP,
      role: 'view',
      message: null,
    });
    expect((await requests.list(world.ida, 'made', undefined)).items.map((row) => row.id)).toEqual([
      made.id,
    ]);
    expect((await requests.list(world.robin, 'waiting', undefined)).items).toMatchObject([
      { id: made.id, itemName: 'Trip' },
    ]);
    expect((await requests.list(world.owner, 'waiting', undefined)).items).toEqual([]);
  });
});

describe('answering a request', () => {
  async function ask(): Promise<string> {
    return (await requests.request(world.ida, { itemId: ROBIN_TRIP, role: 'view', message: null }))
      .id;
  }

  it('approving shares the item with the asked role and the end date, and tells the requester', async () => {
    const id = await ask();
    const answered = await requests.answer(world.robin, id, {
      decision: 'approve',
      role: 'edit',
      expiresAt: IN_A_DAY,
    });
    expect(answered).toMatchObject({
      state: 'approved',
      role: 'edit',
      expiresAt: IN_A_DAY,
      answeredBy: world.robin.profileId,
    });
    expect(accessOf(world.ida.profileId, ROBIN_TRIP)).toBe('edit');
    expect(world.store.driveGrants.forPerson(ROBIN_TRIP, world.ida.profileId)).toMatchObject({
      role: 'edit',
      expiresAt: IN_A_DAY,
      grantedBy: world.robin.profileId,
    });
    expect(inbox(world.ida.profileId).notifications[0]).toMatchObject({
      kind: 'access_answered',
      refId: id,
      actorProfileId: world.robin.profileId,
    });
    expect((await requests.list(world.ida, 'made', undefined)).items[0]?.itemName).toBe('Trip');
  });

  it('declining shares nothing and tells the requester', async () => {
    const id = await ask();
    expect(await requests.answer(world.robin, id, { decision: 'decline' })).toMatchObject({
      state: 'declined',
      expiresAt: null,
    });
    expect(accessOf(world.ida.profileId, ROBIN_TRIP)).toBe('none');
    expect(inbox(world.ida.profileId).notifications[0]?.kind).toBe('access_answered');
    expect((await requests.list(world.ida, 'made', undefined)).items[0]?.itemName).toBeNull();
  });

  it('lets only the person whose drive it is answer, and only once', async () => {
    const id = await ask();
    await expect(requests.answer(world.ida, id, { decision: 'decline' })).rejects.toThrow(
      /no such/u,
    );
    await expect(requests.answer(world.owner, id, { decision: 'decline' })).rejects.toThrow(
      /no such/u,
    );
    await requests.answer(world.robin, id, { decision: 'decline' });
    await expect(requests.answer(world.robin, id, { decision: 'decline' })).rejects.toThrow(
      /already/u,
    );
  });

  it('allows a new request after a declined one', async () => {
    await requests.answer(world.robin, await ask(), { decision: 'decline' });
    expect(await ask()).toBeTypeOf('string');
  });
});
