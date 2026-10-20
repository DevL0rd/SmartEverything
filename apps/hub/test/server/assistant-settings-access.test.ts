import { API_ENDPOINTS, ApiError, type ClientRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let owner: ClientRow;
let member: ClientRow;

beforeEach(async () => {
  opened = await testStore();
  owner = opened.store.clients.create(
    { name: 'Phone', platform: 'android', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  member = opened.store.clients.create(
    { name: 'Member phone', platform: 'android', role: 'member', tokenHash: 'b'.repeat(64) },
    false,
  );
});

afterEach(async () => {
  await opened.close();
});

function write(client: ClientRow): Promise<unknown> {
  const route = bound(API_ENDPOINTS.updateAssistantSettings, () => {
    throw new ApiError('conflict', 'handler reached');
  });
  return route.run(
    { kind: 'client', client },
    { params: {}, query: {}, body: { voice: { thinking_level: 'high' } }, remote: 'test' },
    testLogger(),
  );
}

describe('the thinking write the native call overlay makes', () => {
  it('is an owner-only PATCH of the assistant settings', () => {
    expect(API_ENDPOINTS.updateAssistantSettings).toMatchObject({
      method: 'PATCH',
      path: '/api/assistant/settings',
      access: 'owner',
    });
    expect(API_ENDPOINTS.readAssistant).toMatchObject({ method: 'GET', path: '/api/assistant' });
  });

  it('reaches the handler with an owner device token, which is the token the native credential holds', async () => {
    await expect(write(owner)).rejects.toMatchObject({ message: 'handler reached' });
  });

  it('refuses a member device token before the handler runs', async () => {
    await expect(write(member)).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Only an owner may do this.',
    });
  });
});
