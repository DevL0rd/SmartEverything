import { describe, expect, it } from 'vitest';
import { ChatDirectory } from '../../../src/assistant/chat-directory';
import { Delegation, NATIVE_DELEGATION } from '../../../src/assistant/delegation/delegation';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { AssistantFiles } from '../../../src/assistant/files';
import { useRig, type Rig } from './support/rig';
import { hubLayout } from '../../../src/data-layout';

let rig: Rig;
useRig((made) => {
  rig = made;
});

describe('delegating from a native conversation', () => {
  it('leaves the helper to the conversation own subagent tool', async () => {
    const { store } = rig.opened;
    const parent = rig.newChat({ kind: 'server' });
    const now = (): Date => new Date();
    const delegation = new Delegation({
      store,
      chats: new ChatDirectory(
        store,
        new AssistantFiles({
          layout: hubLayout(rig.opened.directory, {}),
          chat: store.assistantChat,
          now,
        }),
      ),
      conversation: new ConversationLog(store),
      added: (): void => undefined,
      now,
    });

    await expect(
      delegation.subagent(
        { owner: rig.owner, clientId: rig.clientId, chatId: parent.id, plugin: null },
        parent.id,
        { task: 'Check the garden lights', wait: false, timeoutSeconds: 60 },
      ),
    ).rejects.toThrow(NATIVE_DELEGATION);

    expect(store.aiChats.usingEngine('dsh').filter((chat) => chat.kind === 'subagent')).toEqual([]);
  });
});
