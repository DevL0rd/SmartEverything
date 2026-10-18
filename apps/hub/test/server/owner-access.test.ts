import { API_ENDPOINTS, ApiError, type ClientRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConversationAuthority } from '../../src/harness/authority-contract';
import type { Caller } from '../../src/server/auth';
import { bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let owner: ClientRow;
let member: ClientRow;

beforeEach(async () => {
  opened = await testStore();
  const { store } = opened;
  owner = store.clients.create(
    { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  member = store.clients.create(
    { name: 'Member', platform: 'android', role: 'member', tokenHash: 'b'.repeat(64) },
    false,
  );
});

afterEach(async () => {
  await opened.close();
});

const RAW = {
  params: { chatId: '00000000-0000-4000-8000-000000000001' },
  query: {},
  body: undefined,
  remote: 'test',
} as const;

function service(
  role: 'owner' | 'member',
  requester: ConversationAuthority['requester'] = null,
): Caller {
  const authority: ConversationAuthority = {
    event_id: '00000000-0000-4000-8000-000000000002',
    profile_id: '00000000-0000-4000-8000-000000000003',
    client_id: null,
    kind: 'service',
    role,
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester,
  };
  return { kind: 'service', authority, profileId: authority.profile_id, chatId: null };
}

function attempt(caller: Caller): Promise<unknown> {
  const route = bound(API_ENDPOINTS.readAiChatProvider, () => {
    throw new ApiError('conflict', 'handler reached');
  });
  return route.run(caller, RAW, testLogger());
}

const REACHED = { code: 'conflict', message: 'handler reached' };

describe('an endpoint declared owner-only is decided once, by the router', () => {
  it('declares the provider session as owner-only', () => {
    expect(API_ENDPOINTS.readAiChatProvider.access).toBe('owner');
  });

  it('refuses a member client before the handler runs', async () => {
    await expect(attempt({ kind: 'client', client: member })).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Only an owner may do this.',
    });
  });

  it('refuses an unattended member authority before the handler runs', async () => {
    await expect(attempt(service('member'))).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Only an owner may do this.',
    });
  });

  it('treats an owner authority from an unlisted requester as a member', async () => {
    await expect(attempt(service('owner', 'unlisted'))).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Only an owner may do this.',
    });
    await expect(attempt(service('owner', 'approved'))).rejects.toMatchObject(REACHED);
  });

  it('lets an owner client and an owner authority reach the handler', async () => {
    await expect(attempt({ kind: 'client', client: owner })).rejects.toMatchObject(REACHED);
    await expect(attempt(service('owner'))).rejects.toMatchObject(REACHED);
  });
});
