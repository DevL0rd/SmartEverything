import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DSH_SESSION_EVENTS_WRITE, type AiChatRow } from '@smarteverything/domain';
import { nativeForkSeed, planNativeFork } from '../../../src/harness/forks';
import { recordNativeFork } from '../../../src/harness/fork-record';
import { rewriteNativeHistory } from '../../../src/harness/history-mutation';
import { appendOffloadedImage } from './support/offloaded-image';
import { useRig, type Rig } from './support/rig';
import {
  addMessage,
  nativeConversation,
  reread,
  seedConversation,
  storedHistory,
  TWO_EXCHANGES,
  visibleTexts,
  type Line,
  type SeededConversation,
} from './support/native-conversation';

const FORKED_END = z.object({ reason: z.object({ kind: z.literal('forked') }) });
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

async function nativeForkIntent(
  parent: AiChatRow,
  child: AiChatRow,
  message: string,
): Promise<void> {
  const { store } = rig.opened;
  const plan = await planNativeFork(store, parent, message);
  if (plan !== undefined)
    store.durableWrite(() => {
      recordNativeFork(store, plan, child);
    });
}

async function seedOf(seeded: SeededConversation, child: AiChatRow): Promise<readonly string[]> {
  const seed = await nativeForkSeed(rig.opened.store, child);
  return seed === undefined ? [] : visibleTexts(reread(rig, seeded.sessionId, seed.events));
}

describe('branching a native conversation', () => {
  it('starts the branch after the chosen answer and leaves later messages behind', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const child = branchOf(seeded.chat);
    const answer = rowOf(seeded, 1);

    await nativeForkIntent(seeded.chat, child, answer.id);

    expect(await seedOf(seeded, child)).toStrictEqual(['first question', 'first answer']);
  });

  it('starts the branch at the chosen question when branching from a person message', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const child = branchOf(seeded.chat);
    const question = rowOf(seeded, 2);

    await nativeForkIntent(seeded.chat, child, question.id);

    expect(await seedOf(seeded, child)).toStrictEqual([
      'first question',
      'first answer',
      'second question',
    ]);
  });

  it('does nothing for a parent that has not been opened natively yet', async () => {
    const parent = rig.newChat({ kind: 'server' });
    const child = branchOf(parent);

    await nativeForkIntent(parent, child, randomUUID());

    expect(await nativeForkSeed(rig.opened.store, child)).toBeUndefined();
  });

  it('branches from the latest native message when the chosen one came after the import', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const child = branchOf(seeded.chat);
    const later = addMessage(rig, seeded.chat.id, LATE_LINE);

    await nativeForkIntent(seeded.chat, child, later.id);

    expect(await seedOf(seeded, child)).toHaveLength(4);
  });

  it('refuses a branch point with no native message before it', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const child = branchOf(seeded.chat);
    const earlier = addMessage(rig, seeded.chat.id, LATE_LINE, '2000-01-01T00:00:00.000Z');

    await expect(nativeForkIntent(seeded.chat, child, earlier.id)).rejects.toThrow(
      /no admitted native event identity/u,
    );
  });
});

describe('the history a branch inherits', () => {
  it('marks where the inherited history ends and closes a turn still running in the parent', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const reopened = await rig.service.prepare(
      rig.owner,
      seeded.chat.id,
      rig.authority,
      rig.clientId,
    );
    const next = storedHistory(rig, seeded.sessionId).length;
    await rig.opened.store.live.dshSessions.append(
      {
        claim: reopened.claim,
        operation_id: randomUUID(),
        events: DSH_SESSION_EVENTS_WRITE.parse([
          { type: 'turn/start', seq: next, time: 9_000, data: { turn: 9 } },
          { type: 'step/start', seq: next + 1, time: 9_001, data: { turn: 9, step: 0 } },
        ]),
      },
      rig.service.hostPrincipal(
        rig.owner.profileId,
        rig.service.directory.get({ kind: 'server' }).host,
      ),
    );
    const child = branchOf(seeded.chat);

    await nativeForkIntent(seeded.chat, child, rowOf(seeded, 3).id);
    const events = reread(
      rig,
      seeded.sessionId,
      (await nativeForkSeed(rig.opened.store, child))?.events ?? [],
    );

    const marker = events.findIndex((event) => event.type === 'session/end-seed');
    expect(marker).toBe(next + 2);
    expect(
      events.some(
        (event) =>
          event.type === 'turn/end' &&
          event.seq > marker &&
          FORKED_END.safeParse(event.data).success,
      ),
    ).toBe(true);
  });

  it('branches from a conversation whose images were offloaded', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    await appendOffloadedImage(rig, seeded);
    const child = branchOf(seeded.chat);

    await nativeForkIntent(seeded.chat, child, rowOf(seeded, 3).id);

    const seed = await nativeForkSeed(rig.opened.store, child);
    expect(seed?.events.some((event) => event.type === 'image/offload')).toBe(true);
  });

  it('keeps an earlier edit applied inside the branch', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    await rewriteNativeHistory(rig.service, seeded.chat, [rowOf(seeded, 0)]);
    const child = branchOf(seeded.chat);

    await nativeForkIntent(seeded.chat, child, rowOf(seeded, 3).id);

    expect(await seedOf(seeded, child)).toStrictEqual([
      'first answer',
      'second question',
      'second answer',
    ]);
  });
});

describe('branching a conversation held on a machine', () => {
  const EXCHANGES = [
    { question: 'first question', answer: 'first answer' },
    { question: 'second question', answer: 'second answer' },
  ];

  it('ends the branch after the answer it was started from', async () => {
    const held = await nativeConversation(rig, EXCHANGES);
    const child = branchOf(held.chat);

    await nativeForkIntent(held.chat, child, rowOf(held, 1).id);

    expect(await seedOf(held, child)).toStrictEqual(['first question', 'first answer']);
  });

  it('ends the branch at the question it was started from', async () => {
    const held = await nativeConversation(rig, EXCHANGES);
    const child = branchOf(held.chat);

    await nativeForkIntent(held.chat, child, rowOf(held, 2).id);

    expect(await seedOf(held, child)).toStrictEqual([
      'first question',
      'first answer',
      'second question',
    ]);
  });
});
