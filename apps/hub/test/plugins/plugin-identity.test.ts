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
  it('runs a sender nobody approved as a limited stranger with a chat of their own', () => {
    expect(who(STRANGER_ID)).toStrictEqual({
      requester: 'unlisted',
      profileId: home(),
      guest: STRANGER_ID,
      refusal: null,
    });
    expect(who(null)).toMatchObject({ requester: 'unlisted', guest: 'unknown' });
    expect(turnRoleOf(who(STRANGER_ID).requester)).toBe('member');
  });

  it('keeps an approved person with no home person a limited stranger, never an owner', () => {
    people.set('discord', FRIEND_ID, { name: 'Friend', status: 'approved' });
    expect(who(FRIEND_ID)).toMatchObject({
      requester: 'unlisted',
      profileId: home(),
      guest: FRIEND_ID,
    });
  });

  it('runs an approved person linked to a member as that member in their own profile', () => {
    const sam = person('Sam');
    const saved = people.set('discord', FRIEND_ID, {
      name: 'Sam',
      status: 'approved',
      profile_id: sam.id,
    });
    expect(saved.profile_id).toBe(sam.id);
    expect(who(FRIEND_ID)).toStrictEqual({
      requester: 'approved',
      profileId: sam.id,
      guest: null,
      refusal: null,
    });
    expect(turnRoleOf(who(FRIEND_ID).requester)).toBe('member');
  });

  it('runs the owner of the plugin as an owner in the profile of the owner person they are linked to', () => {
    const partner = person('Partner', { role: 'owner' });
    people.set('discord', FRIEND_ID, {
      name: 'Partner',
      status: 'owner',
      profile_id: partner.id,
    });
    expect(who(FRIEND_ID)).toMatchObject({ requester: 'owner', profileId: partner.id });
  });

  it('refuses to link an approved person to an owner person, so owner powers stay with the one owner', () => {
    const partner = person('Partner', { role: 'owner' });
    expect(() =>
      people.set('discord', FRIEND_ID, {
        name: 'Partner',
        status: 'approved',
        profile_id: partner.id,
      }),
    ).toThrow(ApiError);
    expect(people.find('discord', FRIEND_ID)).toBeUndefined();
  });

  it('never runs an approved row as an owner even if its person later becomes an owner', () => {
    const sam = person('Sam');
    people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    opened.store.personAccess.change(sam.id, { role: 'owner' });
    expect(who(FRIEND_ID)).toMatchObject({ requester: 'approved', profileId: sam.id });
  });

  it('links the owner of the plugin to the home owner and keeps them an owner', () => {
    const saved = people.set('discord', OWNER_ID, { name: 'Me', status: 'owner' });
    expect(saved.profile_id).toBe(home());
    expect(who(OWNER_ID)).toMatchObject({ requester: 'owner', profileId: home() });
    expect(people.requesterOf('discord', OWNER_ID)).toBe('owner');
  });

  it('keeps the owner row of a home that was set up before the link existed an owner', () => {
    opened.store.pluginPeople.save('discord', OWNER_ID, {
      name: 'Me',
      status: 'owner',
      profile_id: home(),
    });
    expect(who(OWNER_ID)).toMatchObject({ requester: 'owner', profileId: home() });
  });

  it('stops trusting a linked person once they stop being an owner', () => {
    const partner = person('Partner', { role: 'owner' });
    people.set('discord', FRIEND_ID, {
      name: 'Partner',
      status: 'owner',
      profile_id: partner.id,
    });
    opened.store.personAccess.change(partner.id, { role: 'member' });
    expect(who(FRIEND_ID)).toMatchObject({ requester: 'approved', profileId: partner.id });
  });

  it('refuses a guest whose time has ended instead of downgrading them to a stranger', () => {
    const guest = person('Guest', {
      role: 'guest',
      expires_at: new Date(START.getTime() + HOUR_MS).toISOString(),
    });
    people.set('discord', FRIEND_ID, { name: 'Guest', status: 'approved', profile_id: guest.id });
    expect(who(FRIEND_ID)).toMatchObject({ requester: 'approved', refusal: null });
    clock = new Date(START.getTime() + 2 * HOUR_MS);
    expect(who(FRIEND_ID)).toMatchObject({
      requester: 'unlisted',
      guest: null,
      refusal: { kind: 'refused_expired' },
    });
    expect(() => admittedIdentityOf(opened.store, 'discord', FRIEND_ID)).toThrow(ApiError);
    expect(opened.store.accessAudit.list(10, guest.id).map((entry) => entry.kind)).toStrictEqual([
      'refused_expired',
    ]);
  });

  it('refuses a linked member who may use the home only from the home network, as chat is never that', () => {
    const sam = person('Sam', { conditions: { home_only: true, schedule: null } });
    people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    expect(who(FRIEND_ID)).toMatchObject({
      requester: 'unlisted',
      refusal: { kind: 'refused_condition' },
    });
    expect(() => admittedIdentityOf(opened.store, 'discord', FRIEND_ID)).toThrow(ApiError);
  });

  it('refuses a linked member during their paused hours and admits them outside', () => {
    opened.store.settings.updateHome({ time_zone: 'UTC' });
    const quiet = { from: '09:30', to: '10:30', urgent: false };
    const sam = person('Sam', { conditions: { home_only: false, schedule: quiet } });
    people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    expect(who(FRIEND_ID).refusal).toBeNull();
    clock = new Date('2026-10-18T10:00:00.000Z');
    expect(who(FRIEND_ID)).toMatchObject({ refusal: { kind: 'refused_condition' } });
    clock = new Date('2026-10-18T11:00:00.000Z');
    expect(who(FRIEND_ID).refusal).toBeNull();
  });

  it('never limits a linked owner by conditions', () => {
    const partner = person('Partner', { role: 'owner' });
    people.set('discord', FRIEND_ID, { name: 'Partner', status: 'owner', profile_id: partner.id });
    expect(who(FRIEND_ID).refusal).toBeNull();
  });

  it('refuses a linked member as soon as an owner revokes their access', () => {
    const sam = person('Sam');
    people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    const lifecycle = lifecycleOf();
    lifecycle.revoke(sam.id, home());
    lifecycle.stop();
    expect(who(FRIEND_ID)).toMatchObject({ refusal: { kind: 'refused_expired' } });
  });

  it('keeps the access of an owner person when they are revoked', () => {
    const partner = person('Partner', { role: 'owner' });
    const lifecycle = lifecycleOf();
    lifecycle.revoke(partner.id, home());
    lifecycle.stop();
    expect(opened.store.personAccess.standing(partner.id)).toMatchObject({ expires_at: null });
  });

  it('treats a person whose link was lost as a stranger, even the owner row', () => {
    const sam = person('Sam');
    people.set('discord', OWNER_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    opened.store.profiles.remove(sam.id);
    expect(opened.store.pluginPeople.find('discord', OWNER_ID)?.profile_id).toBeNull();
    expect(who(OWNER_ID).requester).toBe('unlisted');
  });
});

describe('the chat of a plugin sender', () => {
  const KEY = 'channel';

  it('gives every stranger a chat of their own, apart from each other and from the owner', () => {
    const keys = new Set([
      identityChatKey(who(OWNER_ID).guest, 'discord', KEY),
      identityChatKey(who(STRANGER_ID).guest, 'discord', KEY),
      identityChatKey(who('98').guest, 'discord', KEY),
      identityChatKey(who(null).guest, 'discord', KEY),
    ]);
    expect(keys.size).toBe(4);
  });

  it('keeps the chat key of a listed person the plain channel key', () => {
    const sam = person('Sam');
    people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    expect(identityChatKey(who(FRIEND_ID).guest, 'discord', KEY)).toBe(`plugin:discord:${KEY}`);
  });
});

describe('linking a plugin person to a home person', () => {
  it('refuses to make a member the owner of the plugin', () => {
    const sam = person('Sam');
    expect(() =>
      people.set('discord', OWNER_ID, { name: 'Sam', status: 'owner', profile_id: sam.id }),
    ).toThrow(ApiError);
    expect(() =>
      people.set('discord', OWNER_ID, { name: 'Sam', status: 'owner', profile_id: null }),
    ).toThrow(ApiError);
    expect(people.find('discord', OWNER_ID)).toBeUndefined();
  });

  it('refuses a home person that does not exist', () => {
    expect(() =>
      people.set('discord', FRIEND_ID, {
        name: 'Ghost',
        status: 'approved',
        profile_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).toThrow(ApiError);
  });

  it('keeps the link when only the name changes', () => {
    const sam = person('Sam');
    people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    const renamed = people.set('discord', FRIEND_ID, { name: 'Sam K', status: 'approved' });
    expect(renamed.profile_id).toBe(sam.id);
  });

  it('clears the link when asked to', () => {
    const sam = person('Sam');
    people.set('discord', FRIEND_ID, { name: 'Sam', status: 'approved', profile_id: sam.id });
    const cleared = people.set('discord', FRIEND_ID, {
      name: 'Sam',
      status: 'approved',
      profile_id: null,
    });
    expect(cleared.profile_id).toBeNull();
    expect(who(FRIEND_ID).requester).toBe('unlisted');
  });

  it('takes the owner powers away when the owner of the plugin is made an approved person', () => {
    people.set('discord', OWNER_ID, { name: 'Me', status: 'owner' });
    const demoted = people.set('discord', OWNER_ID, { name: 'Me', status: 'approved' });
    expect(demoted.profile_id).toBeNull();
    expect(who(OWNER_ID).requester).toBe('unlisted');
  });

  it('gives the home owner link to an approved person who becomes the owner', () => {
    people.set('discord', OWNER_ID, { name: 'Me', status: 'approved' });
    const promoted = people.set('discord', OWNER_ID, { name: 'Me', status: 'owner' });
    expect(promoted.profile_id).toBe(home());
    expect(who(OWNER_ID).requester).toBe('owner');
  });
});
