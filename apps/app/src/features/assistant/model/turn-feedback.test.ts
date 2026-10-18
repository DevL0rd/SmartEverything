import { describe, expect, it } from 'vitest';
import { CHAT_RECONNECTING_REASON, type AssistantMessageRow } from '@smarteverything/domain';
import type { Turn } from '../../../store/chat-turns';
import { feedbackKind, feedbackTone, turnFeedback, type FeedbackInput } from './turn-feedback';

function row(fields: Partial<AssistantMessageRow>): AssistantMessageRow {
  return {
    id: 'r1',
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Coordinator',
    text: '',
    attachments: [],
    state: 'working',
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

function turn(fields: Partial<Turn>): Turn {
  return {
    chatId: 'c',
    turnId: 't',
    messageId: null,
    state: 'thinking',
    seq: 1,
    text: '',
    reasoning: '',
    tools: [],
    steps: [],
    reason: null,
    behind: false,
    waiting: [],
    ...fields,
  };
}

const base: FeedbackInput = {
  rows: [row({})],
  turn: null,
  sending: false,
  online: true,
  provider: null,
};

describe('turnFeedback', () => {
  it('says Sending while the message leaves the phone', () => {
    expect(turnFeedback({ ...base, sending: true })?.label).toBe('Sending…');
  });

  it('says Waiting for response before anything has started', () => {
    expect(turnFeedback(base)?.label).toBe('Waiting for response…');
  });

  it('says Thinking, then Working', () => {
    expect(turnFeedback({ ...base, turn: turn({ state: 'thinking' }) })?.label).toBe('Thinking…');
    expect(turnFeedback({ ...base, turn: turn({ state: 'tool' }) })?.label).toBe('Working…');
  });

  it('says Queued without moving dots', () => {
    expect(turnFeedback({ ...base, rows: [row({ state: 'queued' })] })).toEqual({
      label: 'Queued',
      moving: false,
    });
  });

  it('says Reconnecting when offline', () => {
    expect(turnFeedback({ ...base, online: false })?.label).toBe('Reconnecting…');
  });

  it('shows nothing once the reply has been delivered', () => {
    const answered = row({
      id: 'a1',
      role: 'responder',
      state: 'answered',
      reply_to: 'r1',
      created_at: '2026-01-01T10:01:00Z',
    });
    expect(turnFeedback({ ...base, rows: [row({ state: 'answered' }), answered] })).toBeNull();
  });
});

describe('feedbackTone and feedbackKind', () => {
  it('shows a provider retry as the red Reconnecting label and never the provider wording', () => {
    const feedback = turnFeedback({
      ...base,
      turn: turn({ state: 'thinking', reason: CHAT_RECONNECTING_REASON }),
    });
    expect(feedback).toEqual({ label: 'Reconnecting…', moving: true });
    expect(feedbackKind(feedback)).toBe('reconnecting');
    expect(feedback === null ? null : feedbackTone(feedback)).toBe('critical');
  });

  it('ignores any other thinking reason text', () => {
    const feedback = turnFeedback({
      ...base,
      turn: turn({ state: 'thinking', reason: 'Provider busy, retrying…' }),
    });
    expect(feedback?.label).not.toContain('retrying');
  });

  it('is critical only while reconnecting', () => {
    expect(feedbackTone({ label: 'Reconnecting…', moving: true })).toBe('critical');
    expect(feedbackTone({ label: 'Working…', moving: true })).toBe('variant');
  });

  it('recognises the states the header cares about', () => {
    expect(feedbackKind(null)).toBeNull();
    expect(feedbackKind({ label: 'Waiting for approval', moving: false })).toBe('needs-you');
    expect(feedbackKind({ label: 'Waiting for your answer', moving: false })).toBe('needs-you');
    expect(feedbackKind({ label: 'Switching machine…', moving: true })).toBe('switching');
    expect(feedbackKind({ label: 'Reconnecting…', moving: true })).toBe('reconnecting');
    expect(feedbackKind({ label: 'Thinking…', moving: true })).toBeNull();
  });
});
