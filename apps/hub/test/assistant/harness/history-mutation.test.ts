import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { KNOWN_SESSION_EVENT_TYPES, foldSurface, pluginRecordOf } from '@deepseek-ai/dsh-session';
import { ApiError, ENGINE } from '@smarteverything/domain';
import { closeNativeHistory } from '../../../src/assistant/engines/dsh/history-change';
import { nativeHistoryPrefix, rewriteNativeHistory } from '../../../src/harness/history-mutation';
import { appendOffloadedImage } from './support/offloaded-image';
import { useRig, type Rig } from './support/rig';
import {
  nativeConversation,
  reread,
  seedConversation,
  storedHistory,
  turnEnds,
  TWO_EXCHANGES,
  visibleTexts,
} from './support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});

describe('native history after an edit or a retry', () => {
  it('hides a deleted message and its answer from the conversation the model sees', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const [, , second, secondAnswer] = seeded.rows;

    await rewriteNativeHistory(
      rig.service,
      seeded.chat,
      [second, secondAnswer].flatMap((row) => (row === undefined ? [] : [row])),
    );

    expect(visibleTexts(storedHistory(rig, seeded.sessionId))).toStrictEqual([
      'first question',
      'first answer',
    ]);
  });

  it('keeps the earlier messages untouched in the surface so their prompt cache is reused', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const [, , second, secondAnswer] = seeded.rows;
    const before = foldSurface(storedHistory(rig, seeded.sessionId)).nodes;

    await rewriteNativeHistory(
      rig.service,
      seeded.chat,
      [second, secondAnswer].flatMap((row) => (row === undefined ? [] : [row])),
    );

    const after = foldSurface(storedHistory(rig, seeded.sessionId)).nodes;
    const kept = before.slice(0, 3);
    expect(after.slice(0, kept.length)).toStrictEqual(kept);
    expect(visibleTexts(storedHistory(rig, seeded.sessionId))).toStrictEqual([
      'first question',
      'first answer',
    ]);
  });

  it('records each edit as an ignorable plugin record and every unknown type as ignorable', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const [first] = seeded.rows;

    await rewriteNativeHistory(rig.service, seeded.chat, first === undefined ? [] : [first]);
    const history = storedHistory(rig, seeded.sessionId);

    const records = history.flatMap((event) => pluginRecordOf(event) ?? []);
    expect(records.map((record) => record.type)).toContain('plugin:smarteverything/history-edit');
    const unknown = history.filter((event) => !KNOWN_SESSION_EVENT_TYPES.has(event.type));
    expect(unknown.every((event) => event.ignorable === true)).toBe(true);
  });

  it('edits a conversation whose images were offloaded', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    await appendOffloadedImage(rig, seeded);
    const [first] = seeded.rows;
    const before = storedHistory(rig, seeded.sessionId).length;

    await rewriteNativeHistory(rig.service, seeded.chat, first === undefined ? [] : [first]);

    expect(storedHistory(rig, seeded.sessionId).length).toBeGreaterThan(before);
  });

  it('keeps every other message exactly as it was', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const [first] = seeded.rows;

    await rewriteNativeHistory(rig.service, seeded.chat, first === undefined ? [] : [first]);

    expect(visibleTexts(storedHistory(rig, seeded.sessionId))).toStrictEqual([
      'first answer',
      'second question',
      'second answer',
    ]);
  });

  it('adds nothing when the rows to remove were already removed', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const [first] = seeded.rows;
    const rows = first === undefined ? [] : [first];
    await rewriteNativeHistory(rig.service, seeded.chat, rows);
    const length = storedHistory(rig, seeded.sessionId).length;

    await rewriteNativeHistory(rig.service, seeded.chat, rows);

    expect(storedHistory(rig, seeded.sessionId)).toHaveLength(length);
  });

  it('accumulates successive edits instead of restoring an earlier removal', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const [first, , , secondAnswer] = seeded.rows;
    await rewriteNativeHistory(rig.service, seeded.chat, first === undefined ? [] : [first]);

    await rewriteNativeHistory(
      rig.service,
      seeded.chat,
      secondAnswer === undefined ? [] : [secondAnswer],
    );

    expect(visibleTexts(storedHistory(rig, seeded.sessionId))).toStrictEqual([
      'first answer',
      'second question',
    ]);
  });

  it('never rewrites the history of a session that belongs to another conversation', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const other = rig.newChat({ kind: 'server' });
    const foreign = rig.opened.store.aiChats.update(other.id, {
      engine: rig.service.binding(seeded.chat),
    });

    await expect(
      rewriteNativeHistory(rig.service, foreign, seeded.rows.slice(0, 1)),
    ).rejects.toThrow(ApiError);
  });

  it('leaves chats that are not native conversations alone', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const plain = rig.opened.store.aiChats.update(seeded.chat.id, {
      engine: ENGINE.parse({
        kind: 'claude',
        device_id: '11111111-1111-4111-8111-111111111111',
        model: 'model-a',
      }),
    });
    const before = storedHistory(rig, seeded.sessionId).length;

    await rewriteNativeHistory(rig.service, plain, seeded.rows.slice(0, 1));

    expect(storedHistory(rig, seeded.sessionId)).toHaveLength(before);
  });
});

describe('the history up to a branch point', () => {
  it('keeps only the messages up to the boundary', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const history = storedHistory(rig, seeded.sessionId);
    const [questionEnd, answerEnd] = turnEnds(history);

    const throughQuestion = nativeHistoryPrefix(history, questionEnd ?? -1);
    const throughAnswer = nativeHistoryPrefix(history, answerEnd ?? -1);

    expect(visibleTexts(reread(rig, seeded.sessionId, throughQuestion))).toStrictEqual([
      'first question',
    ]);
    expect(visibleTexts(reread(rig, seeded.sessionId, throughAnswer))).toStrictEqual([
      'first question',
      'first answer',
    ]);
  });

  it('returns the history untouched when the boundary is its end', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const history = storedHistory(rig, seeded.sessionId);

    expect(nativeHistoryPrefix(history, history.length - 1)).toBe(history);
  });

  it('keeps an earlier edit applied inside the branch', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES);
    const [first] = seeded.rows;
    await rewriteNativeHistory(rig.service, seeded.chat, first === undefined ? [] : [first]);
    const history = storedHistory(rig, seeded.sessionId);
    const answerEnd = turnEnds(history)[1];

    const prefix = nativeHistoryPrefix(history, answerEnd ?? -1);

    expect(visibleTexts(reread(rig, seeded.sessionId, prefix))).toStrictEqual(['first answer']);
  });
});

describe('native history of conversations held on a machine', () => {
  const EXCHANGES = [
    { question: 'first question', answer: 'first answer' },
    { question: 'second question', answer: 'second answer' },
  ];

  it('hides a deleted exchange and keeps the rest', async () => {
    const held = await nativeConversation(rig, EXCHANGES);
    const [question, answer] = held.rows.slice(2);

    await rewriteNativeHistory(
      rig.service,
      held.chat,
      [question, answer].flatMap((row) => (row === undefined ? [] : [row])),
    );

    expect(visibleTexts(storedHistory(rig, held.sessionId))).toStrictEqual([
      'first question',
      'first answer',
    ]);
  });

  it('hides only the answer when a reply is retried', async () => {
    const held = await nativeConversation(rig, EXCHANGES);
    const answer = held.rows[3];

    await rewriteNativeHistory(rig.service, held.chat, answer === undefined ? [] : [answer]);

    expect(visibleTexts(storedHistory(rig, held.sessionId))).toStrictEqual([
      'first question',
      'first answer',
      'second question',
    ]);
  });

  it('rewrites a turn that was interrupted before its outcome was confirmed', async () => {
    const held = await nativeConversation(rig, [
      EXCHANGES[0] ?? { question: '', answer: '' },
      { question: 'pending question', answer: 'pending answer', confirmed: false },
    ]);
    const answer = held.rows[3];

    await rewriteNativeHistory(rig.service, held.chat, answer === undefined ? [] : [answer]);

    expect(visibleTexts(storedHistory(rig, held.sessionId))).toStrictEqual([
      'first question',
      'first answer',
      'pending question',
    ]);
  });
});

describe('changing the history of a chat whose machine is away', () => {
  it('still hides a deleted exchange while the machine is offline', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES, rig.desk.target);
    rig.service.directory.offline(rig.desk.target);
    const [, , second, secondAnswer] = seeded.rows;

    await rewriteNativeHistory(
      rig.service,
      seeded.chat,
      [second, secondAnswer].flatMap((row) => (row === undefined ? [] : [row])),
    );

    expect(visibleTexts(storedHistory(rig, seeded.sessionId))).toStrictEqual([
      'first question',
      'first answer',
    ]);
  });

  it('detaches the session so the next message attaches a machine to the changed history', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES, rig.desk.target);
    const [first] = seeded.rows;

    await rewriteNativeHistory(rig.service, seeded.chat, first === undefined ? [] : [first]);

    expect(rig.opened.store.dshSessions.attached(seeded.sessionId, rig.owner.profileId)).toBeNull();
  });

  it('asks nothing of a machine that is offline before the change', async () => {
    const seeded = await seedConversation(rig, TWO_EXCHANGES, rig.desk.target);
    rig.service.directory.offline(rig.desk.target);
    rig.calls.length = 0;

    await closeNativeHistory(rig.service, seeded.chat, rig.owner, false);

    expect(rig.calls).toStrictEqual([]);
  });

  it('stops and closes a machine that holds the session before the change', async () => {
    const chat = rig.newChat(rig.desk.target);
    const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    await rig.service.directory.execute(rig.desk.target, randomUUID(), open);
    rig.calls.length = 0;

    await closeNativeHistory(rig.service, rig.opened.store.aiChats.chat(chat.id), rig.owner, true);

    expect(rig.calls).toStrictEqual(['desk:interrupt', 'desk:close']);
  });

  it('refuses to change a history while a machine change is under way', async () => {
    const chat = rig.newChat(rig.desk.target);
    const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    await rig.service.directory.execute(rig.desk.target, randomUUID(), open);
    rig.opened.store.harnessSessions.markSwitching(open.claim.session_id);

    await expect(
      closeNativeHistory(rig.service, rig.opened.store.aiChats.chat(chat.id), rig.owner, false),
    ).rejects.toThrow(/machine change/u);
  });
});
