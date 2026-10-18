import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { announcementOf } from './reply-announcement';
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

describe('announcementOf', () => {
  it('announces a finished reply with its text', () => {
    expect(announcementOf(reply({ text: 'The backup   is fine.' }))).toEqual({
      text: 'Coordinator replied: The backup is fine.',
      urgent: false,
    });
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
