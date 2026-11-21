import { ApiError, PLUGIN_MANIFEST, turnRoleOf, type ProfileRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccessLifecycle } from '../../src/server/access-lifecycle';
import {
  admittedIdentityOf,
  identityChatKey,
  pluginIdentityOf,
} from '../../src/plugins/plugin-identity';
import { PluginPeople } from '../../src/plugins/plugin-people';
import { testStore, type TestStore } from '../support/store';

const START = new Date('2026-10-18T09:00:00.000Z');
const HOUR_MS = 3_600_000;
const OWNER_ID = '1';
const FRIEND_ID = '2';
const STRANGER_ID = '99';

let clock = START;
let opened: TestStore;
let people: PluginPeople;

beforeEach(async () => {
  clock = START;
  opened = await testStore(() => clock);
  const manifest = PLUGIN_MANIFEST.parse({
    id: 'discord',
    name: 'Discord',
    version: '1.0.0',
    description: 'A plugin for tests',
    publisher: 'Tests',
    permissions: { inbound: true },
  });
  opened.store.plugins.create({ manifest, source: 'local', location: null, trusted: true });
  people = new PluginPeople(opened.store);
  await people.load('discord');
});

afterEach(async () => {
  await opened.close();
});

function home(): string {
  return opened.store.personAccess.homeOwner();
}

function lifecycleOf(): AccessLifecycle {
  return new AccessLifecycle({
    store: opened.store,
    now: (): Date => clock,
    clientRemoved: (): void => undefined,
    clientPaused: (): void => undefined,
    lapseGrants: (): Promise<void> => Promise.resolve(),
  });
}

function who(externalId: string | null): ReturnType<typeof pluginIdentityOf> {
  return pluginIdentityOf(opened.store, 'discord', externalId);
}

function person(
  name: string,
  change: Parameters<TestStore['store']['personAccess']['change']>[1] = {},
): ProfileRow {
  const created = opened.store.profiles.create({ name });
  if (Object.keys(change).length > 0) {
    opened.store.personAccess.change(created.id, change);
  }
  return created;
}

describe('who a plugin sender runs as', () => {
  it('runs a sender nobody approved as a limited stranger with a chat of their own', async () => {
    expect(await who(STRANGER_ID)).toStrictEqual({
      requester: 'unlisted',
      profileId: home(),
      guest: STRANGER_ID,
      refusal: null,
    });
    expect(await who(null)).toMatchObject({ requester: 'unlisted', guest: 'unknown' });
    expect(turnRoleOf((await who(STRANGER_ID)).requester)).toBe('member');
  });

  it('keeps an approved person with no home person a limited stranger, never an owner', async () => {
    await people.set('discord', FRIEND_ID, { name: 'Friend', status: 'approved' });
    expect(await who(FRIEND_ID)).toMatchObject({
      requester: 'unlisted',
      profileId: home(),
      guest: FRIEND_ID,
    });
  });

  it('runs an approved person linked to a member as that member in their own profile', async () => {
    const sam = person('Sam');
    const saved = await people.set('discord', FRIEND_ID, {
      name: 'Sam',
      status: 'approved',
      profile_id: sam.id,
    });
    expect(saved.profile_id).toBe(sam.id);
    expect(await who(FRIEND_ID)).toStrictEqual({
      requester: 'approved',
      profileId: sam.id,
      guest: null,
      refusal: null,
    });
    expect(turnRoleOf((await who(FRIEND_ID)).requester)).toBe('member');
  });

  it('runs the owner of the plugin as an owner in the profile of the owner person they are linked to', async () => {
    const partner = person('Partner', { role: 'owner' });
    await people.set('discord', FRIEND_ID, {
      name: 'Partner',
      status: 'owner',
      profile_id: partner.id,
    });
    expect(await who(FRIEND_ID)).toMatchObject({ requester: 'owner', profileId: partner.id });
  });

  it('refuses to link an approved person to an owner person, so owner powers stay with the one owner', async () => {
    const partner = person('Partner', { role: 'owner' });
    await expect(
      people.set('discord', FRIEND_ID, {
        name: 'Partner',
        status: 'approved',
        profile_id: partner.id,
      }),
    ).rejects.toThrow(ApiError);
    expect(people.find('discord', FRIEND_ID)).toBeUndefined();
  });

  it('never runs an approved row as an owner even if its person later becomes an owner', async () => {
    const sam = person('Sam');
    await people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    opened.store.personAccess.change(sam.id, { role: 'owner' });
    expect(await who(FRIEND_ID)).toMatchObject({ requester: 'approved', profileId: sam.id });
  });

  it('links the owner of the plugin to the home owner and keeps them an owner', async () => {
    const saved = await people.set('discord', OWNER_ID, { name: 'Me', status: 'owner' });
    expect(saved.profile_id).toBe(home());
    expect(await who(OWNER_ID)).toMatchObject({ requester: 'owner', profileId: home() });
    expect(await people.requesterOf('discord', OWNER_ID)).toBe('owner');
  });

  it('keeps the owner row of a home that was set up before the link existed an owner', async () => {
    opened.store.pluginPeople.save('discord', OWNER_ID, {
      name: 'Me',
      status: 'owner',
      profile_id: home(),
    });
    expect(await who(OWNER_ID)).toMatchObject({ requester: 'owner', profileId: home() });
  });

  it('stops trusting a linked person once they stop being an owner', async () => {
    const partner = person('Partner', { role: 'owner' });
    await people.set('discord', FRIEND_ID, {
      name: 'Partner',
      status: 'owner',
      profile_id: partner.id,
    });
    opened.store.personAccess.change(partner.id, { role: 'member' });
    expect(await who(FRIEND_ID)).toMatchObject({ requester: 'approved', profileId: partner.id });
  });

  it('refuses a guest whose time has ended instead of downgrading them to a stranger', async () => {
    const guest = person('Guest', {
      role: 'guest',
      expires_at: new Date(START.getTime() + HOUR_MS).toISOString(),
    });
    await people.set('discord', FRIEND_ID, {
      name: 'Guest',
      status: 'approved',
      profile_id: guest.id,
    });
    expect(await who(FRIEND_ID)).toMatchObject({ requester: 'approved', refusal: null });
    clock = new Date(START.getTime() + 2 * HOUR_MS);
    expect(await who(FRIEND_ID)).toMatchObject({
      requester: 'unlisted',
      guest: null,
      refusal: { kind: 'refused_expired' },
    });
    await expect(admittedIdentityOf(opened.store, 'discord', FRIEND_ID)).rejects.toThrow(ApiError);
    const audit = await opened.store.host.call('accessAudit', 'list', 10, guest.id);
    expect(audit.map((entry) => entry.kind)).toStrictEqual(['refused_expired']);
  });

  it('refuses a linked member who may use the home only from the home network, as chat is never that', async () => {
    const sam = person('Sam', { conditions: { home_only: true, schedule: null } });
    await people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    expect(await who(FRIEND_ID)).toMatchObject({
      requester: 'unlisted',
      refusal: { kind: 'refused_condition' },
    });
    await expect(admittedIdentityOf(opened.store, 'discord', FRIEND_ID)).rejects.toThrow(ApiError);
  });

  it('refuses a linked member during their paused hours and admits them outside', async () => {
    opened.store.settings.updateHome({ time_zone: 'UTC' });
    const quiet = { from: '09:30', to: '10:30', urgent: false };
    const sam = person('Sam', { conditions: { home_only: false, schedule: quiet } });
    await people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    expect((await who(FRIEND_ID)).refusal).toBeNull();
    clock = new Date('2026-10-18T10:00:00.000Z');
    expect(await who(FRIEND_ID)).toMatchObject({ refusal: { kind: 'refused_condition' } });
    clock = new Date('2026-10-18T11:00:00.000Z');
    expect((await who(FRIEND_ID)).refusal).toBeNull();
  });

  it('never limits a linked owner by conditions', async () => {
    const partner = person('Partner', { role: 'owner' });
    await people.set('discord', FRIEND_ID, {
      name: 'Partner',
      status: 'owner',
      profile_id: partner.id,
    });
    expect((await who(FRIEND_ID)).refusal).toBeNull();
  });

  it('refuses a linked member as soon as an owner revokes their access', async () => {
    const sam = person('Sam');
    await people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    const lifecycle = lifecycleOf();
    await lifecycle.revoke(sam.id, home());
    await lifecycle.idle();
    lifecycle.stop();
    expect(await who(FRIEND_ID)).toMatchObject({ refusal: { kind: 'refused_expired' } });
  });

  it('keeps the access of an owner person when they are revoked', async () => {
    const partner = person('Partner', { role: 'owner' });
    const lifecycle = lifecycleOf();
    await lifecycle.revoke(partner.id, home());
    lifecycle.stop();
    expect(opened.store.personAccess.standing(partner.id)).toMatchObject({ expires_at: null });
  });

  it('treats a person whose link was lost as a stranger, even the owner row', async () => {
    const sam = person('Sam');
    await people.set('discord', OWNER_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    opened.store.profiles.remove(sam.id);
    expect(opened.store.pluginPeople.find('discord', OWNER_ID)?.profile_id).toBeNull();
    expect((await who(OWNER_ID)).requester).toBe('unlisted');
  });
});

describe('the chat of a plugin sender', () => {
  const KEY = 'channel';

  it('gives every stranger a chat of their own, apart from each other and from the owner', async () => {
    const keys = new Set([
      identityChatKey((await who(OWNER_ID)).guest, 'discord', KEY),
      identityChatKey((await who(STRANGER_ID)).guest, 'discord', KEY),
      identityChatKey((await who('98')).guest, 'discord', KEY),
      identityChatKey((await who(null)).guest, 'discord', KEY),
    ]);
    expect(keys.size).toBe(4);
  });

  it('keeps the chat key of a listed person the plain channel key', async () => {
    const sam = person('Sam');
    await people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    expect(identityChatKey((await who(FRIEND_ID)).guest, 'discord', KEY)).toBe(
      `plugin:discord:${KEY}`,
    );
  });
});

describe('linking a plugin person to a home person', () => {
  it('refuses to make a member the owner of the plugin', async () => {
    const sam = person('Sam');
    await expect(
      people.set('discord', OWNER_ID, { name: 'Sam', status: 'owner', profile_id: sam.id }),
    ).rejects.toThrow(ApiError);
    await expect(
      people.set('discord', OWNER_ID, { name: 'Sam', status: 'owner', profile_id: null }),
    ).rejects.toThrow(ApiError);
    expect(people.find('discord', OWNER_ID)).toBeUndefined();
  });

  it('refuses a home person that does not exist', async () => {
    await expect(
      people.set('discord', FRIEND_ID, {
        name: 'Ghost',
        status: 'approved',
        profile_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow(ApiError);
  });

  it('keeps the link when only the name changes', async () => {
    const sam = person('Sam');
    await people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    const renamed = await people.set('discord', FRIEND_ID, { name: 'Sam K', status: 'approved' });
    expect(renamed.profile_id).toBe(sam.id);
  });

  it('clears the link when asked to', async () => {
    const sam = person('Sam');
    await people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    const cleared = await people.set('discord', FRIEND_ID, {
      name: 'Sam',
      status: 'approved',
      profile_id: null,
    });
    expect(cleared.profile_id).toBeNull();
    expect((await who(FRIEND_ID)).requester).toBe('unlisted');
  });

  it('takes the owner powers away when the owner of the plugin is made an approved person', async () => {
    await people.set('discord', OWNER_ID, { name: 'Me', status: 'owner' });
    const demoted = await people.set('discord', OWNER_ID, { name: 'Me', status: 'approved' });
    expect(demoted.profile_id).toBeNull();
    expect((await who(OWNER_ID)).requester).toBe('unlisted');
  });

  it('gives the home owner link to an approved person who becomes the owner', async () => {
    await people.set('discord', OWNER_ID, { name: 'Me', status: 'approved' });
    const promoted = await people.set('discord', OWNER_ID, { name: 'Me', status: 'owner' });
    expect(promoted.profile_id).toBe(home());
    expect((await who(OWNER_ID)).requester).toBe('owner');
  });
});
