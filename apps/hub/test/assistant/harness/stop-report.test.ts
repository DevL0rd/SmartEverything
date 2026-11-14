import { afterEach, describe, expect, it } from 'vitest';
import type { AiChatRow } from '@smarteverything/domain';
import { ChatDirectory } from '../../../src/assistant/chat-directory';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { Delegation, type AskSender } from '../../../src/assistant/delegation/delegation';
import {
  completeNativeTurn,
  type NativeCompletion,
} from '../../../src/assistant/engines/dsh/projector-completion';
import { TurnStream } from '../../../src/assistant/conversation/stream';
import { AssistantFiles } from '../../../src/assistant/files';
import {
  CONNECTION_LOST,
  HUB_RESTARTED,
  STOPPED_BY_USER,
  interruptionCode,
} from '../../../src/assistant/interruption';
import type { StoredEvent } from '../../../src/store/repositories/assistant-events';
import { hubLayout } from '../../../src/data-layout';
import { CLAUDE_TEST_ENGINE } from '../../support/engine';
import { harnessRig, type Rig } from './support/rig';

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

interface Launched {
  readonly parent: AiChatRow;
  readonly child: AiChatRow;
  readonly event: StoredEvent;
  readonly settle: (completion: NativeCompletion, spoken: string) => void;
  readonly delegation: Delegation;
  readonly sender: AskSender;
}

function launch(made: Rig, wait: boolean): Launched & { readonly answer: Promise<unknown> } {
  const { store } = made.opened;
  const now = (): Date => new Date();
  const conversation = new ConversationLog(store);
  const chats = new ChatDirectory(
    store,
    new AssistantFiles({
      layout: hubLayout(made.opened.directory, {}),
      chat: store.assistantChat,
      now,
    }),
  );
  const delegation = new Delegation({
    store,
    chats,
    conversation,
    added: (): void => undefined,
    now,
  });
  const parent = chats.create(made.owner, {
    title: 'Planner',
    engine: CLAUDE_TEST_ENGINE,
    parent_id: made.newChat(made.hub.target).id,
  });
  const sender: AskSender = {
    owner: made.owner,
    clientId: made.clientId,
    chatId: parent.id,
    plugin: null,
  };
  const answer = delegation.subagent(sender, parent.id, {
    task: 'Check the garage lights',
    wait,
    timeoutSeconds: 60,
  });
  const [event] = store.assistantEvents.pending().filter((row) => row.chat_id !== parent.id);
  if (event === undefined) throw new Error('The helper task was not queued.');
  const child = store.aiChats.chat(event.chat_id);
  delegation.admit(event);
  const settle = (completion: NativeCompletion, spoken: string): void => {
    const reply = conversation.startReply(child, event.message_id, 'model-a');
    const stream = new TurnStream(
      { chatId: child.id, turnId: event.id, messageId: reply.id, profileId: child.profile_id },
      (): void => undefined,
    );
    stream.text(spoken);
    completeNativeTurn({
      service: made.service,
      conversation,
      turn: { event, chat: child, replyId: reply.id, stream },
      event: completion,
      finished: delegation.finished.bind(delegation),
      retire: (): void => undefined,
    });
  };
  return { parent, child, event, settle, delegation, sender, answer };
}

function reportText(made: Rig, parent: AiChatRow): string | undefined {
  const { store } = made.opened;
  const report = store.assistantEvents
    .pending()
    .find((row) => row.chat_id === parent.id && row.kind === 'report');
  return report?.text;
}

describe('a helper that the user stopped', () => {
  it('tells its parent why it did not finish and is recorded as interrupted', async () => {
    rig = await harnessRig();
    const { parent, event, settle } = launch(rig, false);

    settle({ kind: 'completed', interrupted: true }, 'Half an answer');

    expect(reportText(rig, parent)).toBe(`It could not finish: ${STOPPED_BY_USER}`);
    expect(rig.opened.store.aiAgentRuns.read(event.id)).toMatchObject({
      state: 'interrupted',
      supported_actions: ['open_chat', 'delete'],
    });
  });

  it('hands a waiting parent the stop reason instead of the partial answer', async () => {
    rig = await harnessRig();
    const { settle, answer, parent } = launch(rig, true);

    settle({ kind: 'completed', interrupted: true }, 'Half an answer');

    await expect(answer).resolves.toMatchObject({ state: 'failed', text: STOPPED_BY_USER });
    expect(reportText(rig, parent)).toBeUndefined();
  });

  it('tells its parent the failure reason of a helper that errored with no output', async () => {
    rig = await harnessRig();
    const { parent, event, settle } = launch(rig, false);

    settle(
      {
        kind: 'failed',
        failure: { code: 'operation_failed', message: 'Model refused.', retry_at: null },
      },
      '',
    );

    expect(reportText(rig, parent)).toBe('It could not finish: Model refused.');
    expect(rig.opened.store.aiAgentRuns.read(event.id)).toMatchObject({
      state: 'failed',
      error: 'Model refused.',
    });
  });
});

describe('the interruption reasons', () => {
  it('map to the reason codes of a stopped or interrupted run', () => {
    expect(interruptionCode(STOPPED_BY_USER)).toBe('stopped');
    expect(interruptionCode(HUB_RESTARTED)).toBe('interrupted');
    expect(interruptionCode(CONNECTION_LOST)).toBe('interrupted');
    expect(interruptionCode('Model refused.')).toBeNull();
  });
});
