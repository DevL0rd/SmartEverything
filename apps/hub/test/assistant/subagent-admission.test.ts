import { randomUUID } from 'node:crypto';
import { DEFAULT_ENGINE, type AiChatRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SUBAGENT_QUEUE_LIMIT,
  SubagentAdmission,
} from '../../src/assistant/coordination/admission';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let profileId: string;

beforeEach(async () => {
  opened = await testStore();
  const client = opened.store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  profileId = opened.store.profiles.activeOf(client.id).id;
});

afterEach(async () => {
  await opened.close();
});

function chat(parent: AiChatRow | null): AiChatRow {
  return opened.store.aiChats.create({
    profileId,
    kind: parent === null ? 'chat' : 'subagent',
    title: 'Chat',
    icon: null,
    parentId: parent?.id ?? null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  });
}

function queue(target: AiChatRow): StoredEvent {
  return opened.store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: target.id,
    message_id: null,
    profile_id: profileId,
    client_id: null,
    text: 'work',
  });
}

describe('queued subagent work', () => {
  it('lists the root conversation of every pending subagent event, however deep', () => {
    const rootA = chat(null);
    const rootB = chat(null);
    const child = chat(rootA);
    const grandchild = chat(child);
    const sibling = chat(rootB);
    queue(grandchild);
    queue(rootA);
    queue(sibling);

    expect(opened.store.assistantEvents.pendingSubagentRoots()).toStrictEqual([rootA.id, rootB.id]);
  });

  it('shares the active slots between root conversations in turn', () => {
    const admission = new SubagentAdmission(opened.store, 1);
    const rootA = chat(null);
    const rootB = chat(null);
    const childA = chat(rootA);
    const childB = chat(rootB);
    const first = queue(childA);
    const second = queue(childA);
    const other = queue(childB);

    expect(admission.enter(first)).toBe(true);
    opened.store.assistantEvents.mark(first.id, 'delivered_at');
    admission.release(first.id);

    expect(admission.enter(second)).toBe(false);
    expect(admission.enter(other)).toBe(true);
  });

  it('refuses new work once the queue is full', () => {
    const admission = new SubagentAdmission(opened.store);
    const root = chat(null);
    const child = chat(root);
    for (let count = 0; count < SUBAGENT_QUEUE_LIMIT; count += 1) queue(child);

    expect(() => {
      admission.preflight(root, false);
    }).toThrow('The bounded subagent queue is full.');
  });
});
