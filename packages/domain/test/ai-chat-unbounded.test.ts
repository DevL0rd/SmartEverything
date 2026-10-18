import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_MESSAGE_ROW,
  CHAT_ACTIVITY_NOTICE,
  CHAT_STREAM_NOTICE,
  WEB_SOURCES_EMBED,
} from '../src';

const ID = '11111111-1111-4111-8111-111111111111';
const AT = '2026-10-17T10:00:00.000Z';

function tool(index: number): object {
  return {
    callId: `call-${String(index)}`,
    name: 'tool',
    title: 'Tool',
    state: 'done',
    detail: null,
  };
}

describe('hub-produced chat data has no size caps', () => {
  it('accepts an activity notice with many tools, steps and long text', () => {
    const notice = {
      type: 'chat_activity',
      chatId: ID,
      turnId: ID,
      messageId: null,
      seq: 1,
      state: 'tool',
      steps: Array.from({ length: 300 }, () => 'step'),
      draft: 'x'.repeat(200_000),
      reasoning: 'y'.repeat(200_000),
      tools: Array.from({ length: 300 }, (_, index) => tool(index)),
      finish: null,
      reason: null,
    };
    expect(CHAT_ACTIVITY_NOTICE.safeParse(notice).success).toBe(true);
  });

  it('accepts a stream notice with many long parts', () => {
    const parts = Array.from({ length: 200 }, () => ({ kind: 'text', delta: 'z'.repeat(50_000) }));
    expect(
      CHAT_STREAM_NOTICE.safeParse({ type: 'chat_stream', chatId: ID, turnId: ID, seq: 1, parts })
        .success,
    ).toBe(true);
  });

  it('accepts a message row with many embeds and a long attachment transcript', () => {
    const row = {
      id: ID,
      profile_id: ID,
      client_id: null,
      role: 'responder',
      kind: 'text',
      author: 'Jarvis',
      text: 'a'.repeat(100_000),
      attachments: [
        {
          id: ID,
          name: 'voice.ogg',
          mime: 'audio/ogg',
          bytes: 10,
          width: null,
          height: null,
          transcript: 't'.repeat(50_000),
        },
      ],
      state: null,
      reason: null,
      steps: [],
      reply_to: null,
      chat_id: ID,
      origin: null,
      embeds: Array.from({ length: 60 }, () => ({ kind: 'note' })),
      cost_micros: 0,
      model: null,
      created_at: AT,
      updated_at: AT,
    };
    expect(ASSISTANT_MESSAGE_ROW.safeParse(row).error).toBeUndefined();
  });

  it('accepts any number of web sources', () => {
    const sources = Array.from({ length: 50 }, (_, index) => ({
      url: `https://example.com/${String(index)}`,
      title: 'Page',
    }));
    expect(WEB_SOURCES_EMBED.safeParse({ kind: 'web_sources', sources }).success).toBe(true);
  });
});
