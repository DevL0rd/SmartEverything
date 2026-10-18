import { describe, expect, it } from 'vitest';
import { ChatDirectory } from '../../../src/assistant/chat-directory';
import { Coordination } from '../../../src/assistant/coordination/asks';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { AssistantFiles } from '../../../src/assistant/files';
import { nativeForkSeed } from '../../../src/harness/forks';
import { useRig, type Rig } from './support/rig';
import { seedConversation, TWO_EXCHANGES } from './support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});

describe('launching a subagent from a native conversation', () => {
  it('starts the child with the task alone and none of the parent conversation', async () => {
    const { store } = rig.opened;
    const parent = seedConversation(rig, TWO_EXCHANGES).chat;
    const now = (): Date => new Date();
    const coordination = new Coordination({
      store,
      chats: new ChatDirectory(
        store,
        new AssistantFiles({ dataDirectory: rig.opened.directory, chat: store.assistantChat, now }),
        now,
      ),
      conversation: new ConversationLog(store),
      emit: (): void => undefined,
      added: (): void => undefined,
      now,
    });

    const result = await coordination.subagent(
      { owner: rig.owner, clientId: rig.clientId, chatId: parent.id, plugin: null },
      parent.id,
      { task: 'Check the garden lights', wait: false, timeoutSeconds: 60 },
    );

    const child = store.aiChats.chat(result.chatId);
    expect(child).toMatchObject({ kind: 'subagent', parent_id: parent.id });
    expect(child.engine).toMatchObject({ kind: 'dsh', session_id: null });
    expect(store.harnessRecovery.forkOf(child.id)).toBeUndefined();
    expect(nativeForkSeed(store, child)).toBeUndefined();
  });
});
