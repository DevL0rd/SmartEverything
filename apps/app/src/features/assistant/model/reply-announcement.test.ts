import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { announcementOf, replyAnnouncements, type AnnouncementFrame } from './reply-announcement';
import { failedBubbleLabel } from './turn-notice';

function reply(fields: Partial<AssistantMessageRow>): AssistantMessageRow {
  return {
    id: 'r1',
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'responder',
    kind: 'text',
    author: 'Coordinator',
    text: '',
    attachments: [],
    state: 'answered',
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    chat_id: '00000000-0000-4000-8000-000000000003',
    origin: { source: 'app', plugin_id: null, device_id: null, name: 'Me' },
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...fields,
  };
}

const HELPER_DIALOGUE = {
  kind: 'helper_dialogue',
  direction: 'from_helper',
  helper_chat_id: '00000000-0000-4000-8000-000000000004',
  helper_name: 'Onyx',
};

function helperReply(fields: Partial<AssistantMessageRow> = {}): AssistantMessageRow {
  return reply({
    id: 'helper',
    role: 'person',
    state: null,
    text: 'The page is ready.',
    embeds: [HELPER_DIALOGUE],
    created_at: '2026-01-01T10:01:00.000Z',
    updated_at: '2026-01-01T10:01:00.000Z',
    ...fields,
  });
}

function frame(rows: readonly AssistantMessageRow[], revision = 0): AnnouncementFrame {
  return { rows, revision };
}

describe('announcementOf', () => {
  it('announces a finished reply with its text', () => {
    expect(announcementOf(reply({ text: 'The backup   is fine.' }))).toEqual({
      text: 'Coordinator replied: The backup is fine.',
      urgent: false,
    });
  });

  it('announces a newly posted helper reply by name without reading outgoing directions', () => {
    const helper = helperReply();
    const outgoing = helperReply({
      id: 'outgoing',
      embeds: [{ ...HELPER_DIALOGUE, direction: 'to_helper' }],
    });
    expect(announcementOf(helper)).toEqual({
      text: 'Onyx replied: The page is ready.',
      urgent: false,
    });
    for (const state of ['queued', 'delivered', 'answered'] as const) {
      expect(announcementOf({ ...helper, state })).toEqual(announcementOf(helper));
    }
    expect(announcementOf(outgoing)).toBeNull();
  });

  it('trims long replies and says they continue', () => {
    const spoken = announcementOf(reply({ text: 'a'.repeat(400) }))?.text ?? '';
    expect(spoken.endsWith('… Reply continues')).toBe(true);
    expect(spoken.length).toBeLessThan(340);
  });

  it('announces a failure urgently', () => {
    expect(
      announcementOf(reply({ state: 'failed', reason_code: 'unknown', reason: null }))?.urgent,
    ).toBe(true);
  });

  it('announces a stop or an interruption calmly, not as a failure', () => {
    expect(announcementOf(reply({ state: 'failed', reason_code: 'stopped' }))).toEqual({
      text: 'Stopped',
      urgent: false,
    });
    expect(announcementOf(reply({ state: 'failed', reason_code: 'interrupted' }))).toEqual({
      text: 'Interrupted',
      urgent: false,
    });
  });

  it('labels an interrupted request by how it ended, not as an error', () => {
    expect(failedBubbleLabel('stopped')).toBe('Stopped');
    expect(failedBubbleLabel('interrupted')).toBe('Interrupted');
    expect(failedBubbleLabel('unknown')).toBe('Not sent');
  });

  it('stays quiet for queued messages', () => {
    expect(announcementOf(reply({ state: 'queued' }))).toBeNull();
  });
});

describe('reply announcements from live changes', () => {
  it('announces a Coordinator finish after a newer helper post', () => {
    const working = reply({ state: 'working' });
    const helper = helperReply();
    const finished = {
      ...working,
      state: 'answered',
      text: 'The report is ready.',
      updated_at: '2026-01-01T10:02:00.000Z',
    } as const;
    expect(replyAnnouncements(frame([]), frame([working]))).toEqual([announcementOf(working)]);
    expect(replyAnnouncements(frame([working]), frame([helper, working]))).toEqual([
      announcementOf(helper),
    ]);
    expect(replyAnnouncements(frame([helper, working]), frame([helper, finished]))).toEqual([
      { text: 'Coordinator replied: The report is ready.', urgent: false },
    ]);
  });

  it('keeps every new reply and orders the batch by when they were delivered', () => {
    const helper = helperReply();
    const other = helperReply({ id: 'other', text: 'The totals match.' });
    const repeated = helperReply({ id: 'repeated' });
    const finished = reply({
      text: 'I found the source.',
      updated_at: '2026-01-01T10:02:00.000Z',
    });
    const outgoing = helperReply({
      id: 'outgoing',
      embeds: [{ ...HELPER_DIALOGUE, direction: 'to_helper' }],
    });
    const rows = [finished, helper, other, outgoing, repeated];
    expect(replyAnnouncements(frame([]), frame(rows))).toEqual(
      [helper, other, repeated, finished].map(announcementOf),
    );
  });

  it('skips unchanged speech when rows are streamed, delivered or settled', () => {
    const working = reply({ state: 'working' });
    const helper = helperReply({ state: 'queued' });
    const streamed = { ...working, text: 'Still thinking.' };
    const delivered = { ...helper, state: 'delivered' } as const;
    const settled = { ...helper, state: 'answered' } as const;
    expect(replyAnnouncements(frame([working, helper]), frame([delivered, streamed]))).toEqual([]);
    expect(replyAnnouncements(frame([delivered, streamed]), frame([streamed, settled]))).toEqual(
      [],
    );
  });

  it('keeps opening history and reconnect snapshots silent while tracking subsequent live changes', () => {
    const history = frame([reply({ text: 'Saved reply.' })]);
    const helper = helperReply();
    const snapshot = frame([...history.rows, helper], 1);
    expect(replyAnnouncements(null, history)).toEqual([]);
    expect(replyAnnouncements(history, snapshot)).toEqual([]);
    const newHelper = helperReply({ id: 'new-helper' });
    expect(replyAnnouncements(snapshot, frame([...snapshot.rows, newHelper], 1))).toEqual([
      announcementOf(newHelper),
    ]);
  });
});
