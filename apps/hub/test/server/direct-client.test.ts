import { afterEach, beforeEach, expect, it } from 'vitest';
import type { ClientRow } from '@smarteverything/domain';
import { directClient, type Caller } from '../../src/server/auth';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-10-18T10:00:00.000Z');

let opened: TestStore;
let client: ClientRow;

beforeEach(async () => {
  captureLogs();
  opened = await testStore((): Date => NOW);
  client = opened.store.clients.create({
    name: 'Phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'b'.repeat(64),
  });
});

afterEach(async () => {
  await opened.close();
});

it('accepts the person’s own app request', () => {
  expect(directClient({ kind: 'client', client })).toBe(client);
});

it.each<readonly [string, Partial<Extract<Caller, { readonly kind: 'client' }>>]>([
  ['the assistant', { via: 'assistant' }],
  ['an external AI client', { mcpOrigin: 'personal' }],
  ['a plugin key', { pluginId: 'discord' }],
  ['a plugin acting for a person', { pluginRequester: 'owner' }],
  ['a chat turn', { chatId: 'chat-1' }],
])('refuses a request made by %s', (_who, origin) => {
  expect(directClient({ kind: 'client', client, ...origin })).toBeUndefined();
});

it('refuses an anonymous caller', () => {
  expect(directClient({ kind: 'anonymous' })).toBeUndefined();
});
