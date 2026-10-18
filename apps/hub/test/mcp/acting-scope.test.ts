import { randomUUID } from 'node:crypto';
import type { ClientRow, ProfileRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  callerFor,
  profileFor,
  type ActingAs,
  type ActingContext,
} from '../../src/extensions/mcp/tools/acting';
import type { ConversationAuthority } from '../../src/harness/authority-contract';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let ownerProfile: ProfileRow;
let memberProfile: ProfileRow;
let owner: ClientRow;
let member: ClientRow;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  const { store } = opened;
  ownerProfile = store.profiles.first();
  memberProfile = store.profiles.create({ name: 'Robin' });
  owner = store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  const paired = store.clients.create({
    name: 'Member phone',
    platform: 'android',
    role: 'member',
    tokenHash: 'b'.repeat(64),
  });
  member = store.clients.useProfile(paired.id, memberProfile.id);
});

afterEach(async () => {
  await opened.close();
});

function chat(client: ClientRow, profile: ProfileRow): ActingContext {
  return {
    store: opened.store,
    caller: null,
    actor: { clientId: client.id, profileId: profile.id, chatId: null },
  };
}

function service(profile: ProfileRow): ActingContext {
  const authority: ConversationAuthority = {
    event_id: randomUUID(),
    profile_id: profile.id,
    client_id: null,
    kind: 'service',
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester: null,
  };
  return {
    store: opened.store,
    caller: null,
    actor: { authority, clientId: null, profileId: profile.id, chatId: null },
  };
}

function plugin(client: ClientRow, profile: ProfileRow): ActingContext {
  return {
    store: opened.store,
    caller: null,
    actor: {
      clientId: client.id,
      profileId: profile.id,
      chatId: null,
      pluginId: 'discord',
      pluginRequester: 'unlisted',
    },
  };
}

const FAMILIES: readonly (readonly [string, (context: ActingContext, as: ActingAs) => unknown])[] =
  [
    ['person lookup (profileFor)', profileFor],
    ['operations, health and nutrition (callerFor)', callerFor],
  ];

describe.each(FAMILIES)('a profile asked for through %s', (_name, resolve) => {
  it('is refused for a member chat asking about another person', () => {
    expect(() => resolve(chat(member, memberProfile), { personId: ownerProfile.id })).toThrow(
      /Only an owner/,
    );
  });

  it('is refused for a member chat asking to act as another app', () => {
    expect(() => resolve(chat(member, memberProfile), { clientId: owner.id })).toThrow(
      /Only an owner/,
    );
  });

  it('is refused for a service caller asking about another person', () => {
    expect(() => resolve(service(memberProfile), { personId: ownerProfile.id })).toThrow(
      /Only an owner/,
    );
  });

  it('is refused for an unlisted plugin requester on an owner phone', () => {
    expect(() => resolve(plugin(owner, ownerProfile), { personId: memberProfile.id })).toThrow(
      /Only an owner/,
    );
  });

  it('lets a member ask for their own profile or leave it out', () => {
    expect(() =>
      resolve(chat(member, memberProfile), { personId: memberProfile.id }),
    ).not.toThrow();
    expect(() => resolve(chat(member, memberProfile), {})).not.toThrow();
  });

  it('lets a service caller ask for its own profile', () => {
    expect(() => resolve(service(memberProfile), { personId: memberProfile.id })).not.toThrow();
  });

  it('lets an owner chat ask for any person', () => {
    expect(() => resolve(chat(owner, ownerProfile), { personId: memberProfile.id })).not.toThrow();
  });
});

describe('the resolved profile', () => {
  it('is the asked-for one for an owner and the own one for a member', () => {
    expect(profileFor(chat(owner, ownerProfile), { personId: memberProfile.id })).toBe(
      memberProfile.id,
    );
    expect(profileFor(chat(member, memberProfile), {})).toBe(memberProfile.id);
  });

  it('is carried on the caller built for an owner acting for another person', () => {
    expect(callerFor(chat(owner, ownerProfile), { personId: memberProfile.id })).toMatchObject({
      kind: 'client',
      profileId: memberProfile.id,
    });
  });

  it('stays the service profile for a service caller', () => {
    expect(callerFor(service(memberProfile))).toMatchObject({
      kind: 'service',
      profileId: memberProfile.id,
    });
  });
});
