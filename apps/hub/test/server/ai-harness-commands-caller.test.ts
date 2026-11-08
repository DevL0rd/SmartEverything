import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DSH_SESSION_ID } from '@smarteverything/domain';
import type { Caller } from '../../src/server/auth';
import { harnessCommandRoutes } from '../../src/server/handlers/ai-harness-commands';
import { useRig, type Rig } from '../assistant/harness/support/rig';
import { testLogger } from '../support/logs';

const log = testLogger('ai-harness-commands-caller');

let rig: Rig;
useRig((made) => {
  rig = made;
});

function list(caller: Caller): Promise<unknown> {
  const routes = harnessCommandRoutes(rig.service);
  return routes.listAiChatHarnessCommands.run(
    caller,
    {
      params: { chatId: randomUUID() },
      query: {},
      body: { session_id: DSH_SESSION_ID.parse('session-1'), expected_epoch: 1 },
      remote: 'test',
      headers: {},
    },
    log,
  );
}

function client(): Caller {
  return { kind: 'client', client: rig.opened.store.clients.byId(rig.clientId) };
}

it('lets the person’s own app request past the caller gate', async () => {
  await expect(list(client())).rejects.not.toMatchObject({ code: 'forbidden' });
});

it.each<readonly [string, Partial<Extract<Caller, { readonly kind: 'client' }>>]>([
  ['the assistant', { via: 'assistant' }],
  ['an external AI client', { mcpOrigin: 'personal' }],
  ['a plugin key', { pluginId: 'discord' }],
  ['a plugin acting for a person', { pluginRequester: 'owner' }],
  ['a chat turn', { chatId: 'chat-1' }],
])('refuses a request made by %s', async (_who, origin) => {
  await expect(
    list({ kind: 'client', client: rig.opened.store.clients.byId(rig.clientId), ...origin }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});
