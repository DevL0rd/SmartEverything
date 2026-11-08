import { API_ENDPOINTS } from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory, type ChatOwner } from '../../src/assistant/chat-directory';
import { Delegation } from '../../src/assistant/delegation/delegation';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantFiles } from '../../src/assistant/files';
import { operationRunner, operationTool } from '../../src/extensions/mcp/tools/operation-tools';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { CLAUDE_TEST_ENGINE } from '../support/engine';
import { hubLayout } from '../../src/data-layout';

const RESULT = z.object({ chatId: z.uuid(), state: z.string() });

let opened: TestStore;
let chats: ChatDirectory;
let owner: ChatOwner;
let clientId: string;
let parentId: string;
let context: OperatingContext;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  clientId = client.id;
  owner = { profileId: store.profiles.activeOf(client.id).id, role: 'owner' };
  const now = (): Date => new Date();
  chats = new ChatDirectory(
    store,
    new AssistantFiles({ layout: hubLayout(opened.directory, {}), chat: store.assistantChat, now }),
  );
  const delegation = new Delegation({
    store,
    chats,
    conversation: new ConversationLog(store),
    added: (): void => undefined,
    now,
  });
  parentId = chats.create(owner, { title: 'Planner', engine: CLAUDE_TEST_ENGINE }).id;
  context = {
    store,
    caller: null,
    actor: { clientId, profileId: owner.profileId, chatId: parentId },
    operations: {
      run: (name, _caller, input): Promise<unknown> => {
        if (name !== 'runAiSubagent') return Promise.reject(new Error(`Unexpected ${name}`));
        const endpoint = API_ENDPOINTS.runAiSubagent;
        const params = endpoint.params.parse(input.params ?? {});
        return delegation.subagent(
          { owner, clientId, chatId: parentId, plugin: null },
          params.chatId,
          endpoint.body.parse(input.body),
        );
      },
    },
  };
});

afterEach(async () => {
  await opened.close();
});

describe('the subagent tool', () => {
  const tool = operationTool('subagent_run', 'runAiSubagent');
  const run = operationRunner('subagent_run', 'runAiSubagent');

  it('takes no chat id and starts a helper chat under the calling chat', async () => {
    expect(JSON.stringify(tool.listing.inputSchema)).not.toContain('chatId');

    const output = await run(context, {
      task: 'Check the garden lights and report which are on',
      title: 'Garden lights',
      wait: false,
      timeoutSeconds: 60,
    });

    const result = RESULT.parse(output.structured['result']);
    expect(result.state).toBe('queued');
    expect(opened.store.aiChats.chat(result.chatId)).toMatchObject({
      kind: 'subagent',
      parent_id: parentId,
      title: 'Garden lights',
    });
  });

  it('refuses a chat id from the AI', () => {
    expect(() => run(context, { chatId: parentId, task: 'Anything', wait: false })).toThrow(
      'leave chatId out',
    );
  });
});
