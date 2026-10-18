import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withExecutionAuthority } from '../../../src/assistant/turn-authority';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import { imageActorOf } from '../../../src/server/image-authority';
import { harnessRig, type Rig } from '../harness/support/rig';

let rig: Rig;

beforeEach(async () => {
  rig = await harnessRig();
});

afterEach(async () => {
  await rig.close();
});

function authority(): ConversationAuthority {
  return {
    event_id: randomUUID(),
    profile_id: rig.owner.profileId,
    client_id: rig.clientId,
    kind: 'client',
    role: 'owner',
    hub_os_ban: true,
    tools: null,
    plugin_id: null,
    requester: null,
  };
}

describe('a generated image is saved after the turn that started it has ended', () => {
  it('accepts the result once the native writer of the initiating chat was released', () => {
    const chat = rig.newChat({ kind: 'server' });
    rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const { store } = rig.opened;
    const scope = authority();
    store.harnessRecovery.authorize(scope);
    const actor = withExecutionAuthority(scope, () =>
      imageActorOf(
        { store, configured: () => true, spend: () => undefined },
        { kind: 'client', client: store.clients.byId(rig.clientId), chatId: chat.id },
      ),
    );
    const session = store.aiChats.chat(chat.id).engine;
    if (session.kind !== 'dsh' || session.session_id === null)
      throw new Error('The chat has no native session.');
    store.dshSessions.detach(session.session_id, rig.owner.profileId);
    expect(() => {
      withExecutionAuthority(scope, () => {
        actor.authorize('persist', chat.id);
      });
    }).not.toThrow();
  });

  it('asks the spending gate on behalf of the person who started the image', () => {
    const chat = rig.newChat({ kind: 'server' });
    rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const { store } = rig.opened;
    const scope = authority();
    store.harnessRecovery.authorize(scope);
    const asked: unknown[] = [];
    const actor = withExecutionAuthority(scope, () =>
      imageActorOf(
        {
          store,
          configured: () => true,
          spend: (spend): void => {
            asked.push(spend);
          },
        },
        { kind: 'client', client: store.clients.byId(rig.clientId), chatId: chat.id },
      ),
    );
    withExecutionAuthority(scope, () => {
      actor.authorize('provider', chat.id);
    });
    expect(asked).toStrictEqual([{ background: false, profileId: rig.owner.profileId }]);
  });
});
