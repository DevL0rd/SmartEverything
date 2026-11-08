import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, type ClientRow } from '@smarteverything/domain';
import type { Caller } from '../../src/server/auth';
import { nativeCommandRoutes } from '../../src/server/handlers/ai-native-commands';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const log = testLogger('ai-native-commands-caller');
const REACHED = new ApiError('not_found', 'The chat was looked up.');

let opened: TestStore;
let client: ClientRow;
let own: ReturnType<typeof vi.fn<() => never>>;
let routes: ReturnType<typeof nativeCommandRoutes>;

beforeEach(async () => {
  opened = await testStore();
  client = opened.store.clients.create(
    { name: 'Owner', platform: 'android', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  own = vi.fn((): never => {
    throw REACHED;
  });
  routes = nativeCommandRoutes({
    store: opened.store,
    assistant: { chats: { own }, computerProviders: { get: () => undefined } },
  });
});

afterEach(async () => {
  await opened.close();
});

function list(caller: Caller): Promise<unknown> {
  return routes.listAiChatNativeCommands.run(
    caller,
    { params: { chatId: randomUUID() }, query: {}, body: {}, remote: 'test', headers: {} },
    log,
  );
}

it('looks the chat up for the owner’s own app request', async () => {
  await expect(list({ kind: 'client', client })).rejects.toBe(REACHED);
  expect(own).toHaveBeenCalledOnce();
});

it.each<readonly [string, Partial<Extract<Caller, { readonly kind: 'client' }>>]>([
  ['the assistant', { via: 'assistant' }],
  ['an external AI client', { mcpOrigin: 'personal' }],
  ['a plugin key', { pluginId: 'discord' }],
  ['a plugin acting for a person', { pluginRequester: 'owner' }],
  ['a chat turn', { chatId: 'chat-1' }],
])('refuses a request made by %s before touching any chat', async (_who, origin) => {
  await expect(list({ kind: 'client', client, ...origin })).rejects.toMatchObject({
    code: 'forbidden',
  });
  expect(own).not.toHaveBeenCalled();
});
