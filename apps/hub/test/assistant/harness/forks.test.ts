import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AiChatRow } from '@smarteverything/domain';
import { nativeForkIntent, nativeForkSeed } from '../../../src/harness/forks';
import { useRig, type Rig } from './support/rig';
import {
  addMessage,
  nativeConversation,
  reread,
  seedConversation,
  TWO_EXCHANGES,
  visibleTexts,
  type Line,
  type SeededConversation,
} from './support/native-conversation';

const LATE_LINE: Line = { role: 'person', text: 'typed outside the import' };

let rig: Rig;
useRig((made) => {
  rig = made;
});

function branchOf(parent: AiChatRow): AiChatRow {
  return rig.opened.store.aiChats.create({
    profileId: parent.profile_id,
    kind: 'chat',
    title: 'Branch',
    icon: null,
    parentId: parent.id,
    sourceKey: null,
    engine: { ...rig.service.binding(parent), session_id: null },
  });
}

function rowOf(
  conversation: SeededConversation,
  index: number,
): SeededConversation['rows'][number] {
  const row = conversation.rows[index];
  if (row === undefined) throw new Error('The seeded conversation has no such message.');
  return row;
}

function seedOf(seeded: SeededConversation, child: AiChatRow): readonly string[] {
  const seed = nativeForkSeed(rig.opened.store, child);
  return seed === undefined ? [] : visibleTexts(reread(rig, seeded.sessionId, seed.events));
}

describe('branching a native conversation', () => {
  it('starts the branch after the chosen answer and leaves later messages behind', () => {
    const seeded = seedConversation(rig, TWO_EXCHANGES);
    const child = branchOf(seeded.chat);
    const answer = rowOf(seeded, 1);

    nativeForkIntent(rig.opened.store, seeded.chat, child, answer.id);

    expect(seedOf(seeded, child)).toStrictEqual(['first question', 'first answer']);
  });

  it('starts the branch at the chosen question when branching from a person message', () => {
    const seeded = seedConversation(rig, TWO_EXCHANGES);
    const child = branchOf(seeded.chat);
    const question = rowOf(seeded, 2);

    nativeForkIntent(rig.opened.store, seeded.chat, child, question.id);

    expect(seedOf(seeded, child)).toStrictEqual([
      'first question',
      'first answer',
      'second question',
    ]);
  });

  it('does nothing for a parent that has not been opened natively yet', () => {
    const parent = rig.newChat({ kind: 'server' });
    const child = branchOf(parent);

    nativeForkIntent(rig.opened.store, parent, child, randomUUID());

    expect(nativeForkSeed(rig.opened.store, child)).toBeUndefined();
  });

  it('branches from the latest native message when the chosen one came after the import', () => {
    const seeded = seedConversation(rig, TWO_EXCHANGES);
    const child = branchOf(seeded.chat);
    const later = addMessage(rig, seeded.chat.id, LATE_LINE);

    nativeForkIntent(rig.opened.store, seeded.chat, child, later.id);

    expect(seedOf(seeded, child)).toHaveLength(4);
  });

  it('refuses a branch point with no native message before it', () => {
    const seeded = seedConversation(rig, TWO_EXCHANGES);
    const child = branchOf(seeded.chat);
    const earlier = addMessage(rig, seeded.chat.id, LATE_LINE, '2000-01-01T00:00:00.000Z');

    expect(() => {
      nativeForkIntent(rig.opened.store, seeded.chat, child, earlier.id);
    }).toThrow(/no admitted native event identity/u);
  });
});

describe('branching a conversation held on a machine', () => {
  const EXCHANGES = [
    { question: 'first question', answer: 'first answer' },
    { question: 'second question', answer: 'second answer' },
  ];

  it('ends the branch after the answer it was started from', () => {
    const held = nativeConversation(rig, EXCHANGES);
    const child = branchOf(held.chat);

    nativeForkIntent(rig.opened.store, held.chat, child, rowOf(held, 1).id);

    expect(seedOf(held, child)).toStrictEqual(['first question', 'first answer']);
  });

  it('ends the branch at the question it was started from', () => {
    const held = nativeConversation(rig, EXCHANGES);
    const child = branchOf(held.chat);

    nativeForkIntent(rig.opened.store, held.chat, child, rowOf(held, 2).id);

    expect(seedOf(held, child)).toStrictEqual([
      'first question',
      'first answer',
      'second question',
    ]);
  });
});
