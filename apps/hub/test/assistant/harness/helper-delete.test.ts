import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { DSH_SESSION_HEADER } from '@smarteverything/domain';
import { ChatDirectory } from '../../../src/assistant/chat-directory';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { AssistantFiles } from '../../../src/assistant/files';
import { costRolledUp } from '../../../src/assistant/cost-rollup';
import { admitInactiveRemoval } from '../../../src/assistant/agent-runs/inactive-removal';
import {
  adoptSubagentSession,
  settleNativeChild,
} from '../../../src/assistant/engines/dsh/children';
import { harnessRig, type Rig } from './support/rig';
import { hubLayout } from '../../../src/data-layout';

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const NOW = '2026-10-25T05:00:00.000Z';

async function finishedHelper(): Promise<{
  readonly made: Rig;
  readonly parentId: string;
  readonly childId: string;
  readonly childSession: string;
  readonly runId: string;
}> {
  const made = await harnessRig();
  rig = made;
  const { store } = made.opened;
  const parent = made.newChat(made.hub.target);
  const open = made.service.prepare(made.owner, parent.id, made.authority, made.clientId);
  const host = made.service.directory.get(made.hub.target).host;
  const parentGrant = store.harnessSessions.grant(open.claim.session_id);
  if (parentGrant === undefined) throw new Error('The parent session has no grant.');
  const header = DSH_SESSION_HEADER.parse({
    version: 4,
    id: randomUUID(),
    createdAt: Date.now(),
    cwd: '/tmp/work',
    isSeeded: false,
    parentSession: open.claim.session_id,
    origin: 'subagent',
    delegationDepth: 1,
  });
  const { chat, run } = adoptSubagentSession(store, new ConversationLog(store), {
    principal: made.service.hostPrincipal(made.owner.profileId, host),
    parentClaim: open.claim,
    parentGrant,
    header,
    inherited: 0,
    now: NOW,
  });
  const turnEnd = { type: 'turn/end', data: { turn: 0, reason: { kind: 'completed' } } };
  settleNativeChild(store, header.id, [turnEnd], NOW);
  return { made, parentId: parent.id, childId: chat.id, childSession: header.id, runId: run.id };
}

describe('deleting a finished helper from its row', () => {
  it('rechecks an inactive helper and its subtree after new work is queued', async () => {
    const { made, parentId, childId } = await finishedHelper();
    const { store } = made.opened;
    const child = store.aiChats.chat(childId);
    const parent = store.aiChats.chat(parentId);
    const admission = {
      store,
      owner: made.owner,
      chatId: childId,
      status: () => ({ state: 'ready', reason: null }) as const,
    };
    expect(() => {
      admitInactiveRemoval(admission, [child]);
    }).not.toThrow();
    expect(() => {
      admitInactiveRemoval({ ...admission, chatId: parentId }, [parent]);
    }).toThrow('Only inactive helper conversations');
    if (child.engine.kind !== 'dsh') throw new Error('The fixture helper needs a DSH engine.');
    const nested = store.aiChats.create({
      profileId: child.profile_id,
      kind: 'subagent',
      parentId: childId,
      title: 'Nested helper',
      icon: null,
      sourceKey: null,
      engine: { ...child.engine, session_id: null },
    });
    store.assistantEvents.add({
      id: randomUUID(),
      kind: 'chat',
      chat_id: nested.id,
      message_id: null,
      profile_id: child.profile_id,
      client_id: made.clientId,
      text: 'Another task',
      hops: 0,
    });
    expect(() => {
      admitInactiveRemoval(admission, [nested, child]);
    }).toThrow('still working');
    expect(store.aiChats.find(childId)).toBeDefined();
    expect(store.aiChats.find(nested.id)).toBeDefined();
  });

  it('removes every trace of the helper and keeps its cost in the parent', async () => {
    const { made, parentId, childId, childSession, runId } = await finishedHelper();
    const { store } = made.opened;
    store.ledger.rollup(costRolledUp(store));
    const usage = store.ledger.record({
      profile_id: made.owner.profileId,
      chat_id: childId,
      source: 'openrouter',
      work: 'subagent',
      model_id: 'openai/gpt-6-luna',
      generation_id: 'gen-helper',
      cost_micros: 1_200,
      cost_state: 'reported',
    });
    const parentBefore = store.aiChats.chat(parentId);
    const history = store.assistantChat.messages({ chatId: parentId, limit: 100 });
    const run = store.aiAgentRuns.find(runId);
    expect(run?.supported_actions).toStrictEqual(['open_chat', 'delete']);
    const task = run?.source_id ?? '';
    const directory = new ChatDirectory(
      store,
      new AssistantFiles({
        layout: hubLayout(made.opened.directory, {}),
        chat: store.assistantChat,
        now: (): Date => new Date(),
      }),
    );
    const scope = directory.removalScope(made.owner, childId);
    admitInactiveRemoval(
      {
        store,
        owner: made.owner,
        chatId: childId,
        runId,
        status: () => ({ state: 'ready', reason: null }),
      },
      scope,
    );
    await directory.remove(
      made.owner,
      childId,
      scope.map((chat) => chat.id),
    );

    expect(store.aiChats.find(childId)).toBeUndefined();
    expect(store.aiAgentRuns.find(runId)).toBeUndefined();
    expect(store.assistantEvents.find(task)).toBeUndefined();
    expect(store.dshSessions.stat(childSession, made.owner.profileId)).toBeUndefined();
    expect(store.harnessSessions.grant(childSession)).toBeUndefined();
    expect(store.harnessSessions.state(childSession)).toBeUndefined();
    expect(store.assistantChat.messages({ chatId: parentId, limit: 100 })).toStrictEqual(history);
    expect(store.aiChats.chat(parentId).cost_micros).toBe(parentBefore.cost_micros + 1_200);
    expect(store.ledger.get(usage.id)).toMatchObject({ chat_id: parentId, cost_micros: 1_200 });
    store.ledger.reconcile(usage.id, { cost_micros: 1_500 });
    expect(store.aiChats.chat(parentId).cost_micros).toBe(parentBefore.cost_micros + 1_500);
  });
});
