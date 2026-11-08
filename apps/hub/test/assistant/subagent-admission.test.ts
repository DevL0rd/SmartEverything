import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { AI_AGENT_LOOP_SETTINGS, type AiChatRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SubagentAdmission } from '../../src/assistant/delegation/admission';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { testStore, type TestStore } from '../support/store';
import { TEST_ENGINE } from '../support/engine';

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
    engine: TEST_ENGINE,
  });
}

function configure(loops: z.input<typeof AI_AGENT_LOOP_SETTINGS>): void {
  opened.store.assistantChat.saveSettings({
    ...opened.store.assistantChat.settings(),
    agent_loops: AI_AGENT_LOOP_SETTINGS.parse(loops),
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
    configure({ subagents: { max_active: 1 } });
    const admission = new SubagentAdmission(opened.store);
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

  it('never refuses new work because of how much is queued', () => {
    const admission = new SubagentAdmission(opened.store);
    const root = chat(null);
    const child = chat(root);
    for (let count = 0; count < 300; count += 1) queue(child);

    expect(() => {
      admission.preflight(root, false);
    }).not.toThrow();
  });

  it('admits every queued helper while no capacity is set', () => {
    const admission = new SubagentAdmission(opened.store);
    const root = chat(null);
    const events = Array.from({ length: 12 }, () => queue(chat(root)));

    expect(events.map((event) => admission.enter(event))).not.toContain(false);
  });

  it('refuses nesting beyond the depth from the settings', () => {
    configure({ subagents: { max_depth: 2 } });
    const admission = new SubagentAdmission(opened.store);
    const root = chat(null);
    const first = chat(root);
    const second = chat(first);

    expect(() => {
      admission.preflight(first, false);
    }).not.toThrow();
    expect(() => {
      admission.preflight(second, false);
    }).toThrow('nesting depth limit');
  });

  it('allows any nesting while no depth is set', () => {
    const admission = new SubagentAdmission(opened.store);
    let parent = chat(null);
    for (let level = 0; level < 12; level += 1) parent = chat(parent);

    expect(() => {
      admission.preflight(parent, true);
    }).not.toThrow();
  });

  it('asks a waiting helper to queue instead once the capacity from the settings is used', () => {
    configure({ subagents: { max_active: 1 } });
    const admission = new SubagentAdmission(opened.store);
    const root = chat(null);
    const child = chat(root);
    expect(admission.enter(queue(child))).toBe(true);

    expect(() => {
      admission.preflight(child, true);
    }).toThrow('Child capacity is full');
    expect(() => {
      admission.preflight(child, false);
    }).not.toThrow();
  });
});
