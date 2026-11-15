import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { castOf } from '../model/participant';
import { startsMessage, threadOf, type MessageItem } from './thread';

const OPTIONS = {
  cast: castOf('Coordinator', null),
  now: Date.parse('2026-11-14T12:00:00.000Z'),
  timeZone: 'UTC',
  unreadAfter: null,
  openedAt: 0,
  hidden: new Set<string>(),
};

function row(id: string, at: string, patch: Partial<AssistantMessageRow>): AssistantMessageRow {
  return {
    id,
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
    reply_to: 'ask',
    quote: null,
    chat_id: '00000000-0000-4000-8000-000000000003',
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: `2026-11-14T10:00:0${at}.000Z`,
    updated_at: `2026-11-14T10:00:0${at}.000Z`,
    ...patch,
  };
}

const ASK = row('ask', '0', {
  role: 'person',
  author: 'Me',
  text: 'answer me with a voice message',
  reply_to: null,
  origin: { source: 'app', plugin_id: null, device_id: null, name: 'Me' },
});

const VOICE = row('voice', '2', {
  state: null,
  model: 'gemini-2.5-flash-preview-tts',
  attachments: [
    {
      id: '00000000-0000-4000-8000-000000000009',
      name: 'Voice reply.wav',
      mime: 'audio/wav',
      bytes: 64_000,
      width: null,
      height: null,
      transcript: 'The kitchen lights are off.',
    },
  ],
});

function voiceItem(rows: readonly AssistantMessageRow[]): MessageItem | undefined {
  return threadOf(rows, OPTIONS).find((item) => item.row.id === 'voice');
}

describe('an AI voice reply row', () => {
  it('is shown as an assistant message that starts with its clip while the turn still works', () => {
    const item = voiceItem([ASK, row('turn', '1', { state: 'working' }), VOICE]);
    expect(item?.speaker.kind).toBe('ai');
    expect(item !== undefined && startsMessage(item)).toBe(true);
    expect(item?.row.attachments).toHaveLength(1);
  });

  it('stays shown after the turn ends with no text of its own', () => {
    const item = voiceItem([
      ASK,
      row('turn', '1', { updated_at: '2026-11-14T10:00:03.000Z' }),
      VOICE,
    ]);
    expect(item?.speaker.kind).toBe('ai');
    expect(item !== undefined && startsMessage(item)).toBe(true);
  });
});
