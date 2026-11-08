import { describe, expect, it } from 'vitest';
import {
  CHAT_RETRYING_REASON,
  CHAT_WAITING_HELPERS_REASON,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { workStatusOf, workText, type Turn } from '../../../store/chat-turns';
import { RETRYING_LABEL, feedbackKind, turnFeedback, type FeedbackInput } from './turn-feedback';

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
    state: 'delivered',
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

  it('shows nothing for a delivered message while no turn is working', () => {
    expect(turnFeedback(base)).toBeNull();
  });

  it('says Thinking, then Working', () => {
    expect(
      turnFeedback({ ...base, turn: turn({ state: 'thinking', reasoning: 'x' }) })?.label,
    ).toBe('Thinking…');
    expect(turnFeedback({ ...base, turn: turn({ state: 'tool' }) })?.label).toBe('Working…');
  });

  it('says Queued without moving dots', () => {
    expect(turnFeedback({ ...base, rows: [row({ state: 'queued' })] })).toEqual({
      label: 'Queued',
      moving: false,
    });
  });

  it('says Reconnecting when offline', () => {
    expect(turnFeedback({ ...base, online: false, turn: turn({}) })?.label).toBe('Reconnecting…');
  });

  it('shows the running tool of a working turn even when the history looks finished', () => {
    const answered = row({
      id: 'a1',
      role: 'responder',
      state: 'answered',
      reply_to: 'r1',
      created_at: '2026-01-01T10:01:00Z',
    });
    const working = turn({
      state: 'tool',
      tools: [{ callId: 'c1', name: 'bash', title: 'bash', state: 'running', detail: null }],
    });
    expect(
      turnFeedback({ ...base, rows: [row({ state: 'answered' }), answered], turn: working }),
    ).toEqual({ label: 'Working · bash…', moving: true });
    expect(turnFeedback({ ...base, rows: [], turn: turn({ state: 'thinking' }) })?.label).toBe(
      'Waiting for response…',
    );
    const helpers = turn({ state: 'thinking', reason: CHAT_WAITING_HELPERS_REASON });
    expect(turnFeedback({ ...base, turn: helpers })?.label).toBe('Waiting on helpers…');
    expect(workText(workStatusOf(working))).toBe('Working · bash');
    expect(workText(workStatusOf(helpers))).toBe('Waiting on helpers');
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

describe('feedbackKind', () => {
  it('shows a retry as the moving Retrying label and never the provider wording', () => {
    const feedback = turnFeedback({
      ...base,
      turn: turn({ state: 'thinking', reason: CHAT_RETRYING_REASON }),
    });
    expect(feedback).toEqual({ label: RETRYING_LABEL, moving: true });
    expect(feedbackKind(feedback)).toBeNull();
  });

  it('returns to the normal label once the turn works again', () => {
    const feedback = turnFeedback({
      ...base,
      turn: turn({ state: 'thinking', reason: null, reasoning: 'x' }),
    });
    expect(feedback?.label).toBe('Thinking…');
  });

  it('ignores any other thinking reason text', () => {
    const feedback = turnFeedback({
      ...base,
      turn: turn({ state: 'thinking', reason: 'Provider busy, retrying…' }),
    });
    expect(feedback?.label).not.toContain('retrying');
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
