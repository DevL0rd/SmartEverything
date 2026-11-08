import { describe, expect, it } from 'vitest';
import {
  MESSAGE_QUOTE,
  messageQuoteOf,
  type AssistantAttachment,
  type QuotableMessage,
} from '../src/assistant';

const ID = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';

function attachment(mime: string, transcript?: string): AssistantAttachment {
  return {
    id: FILE,
    name: 'file',
    mime,
    bytes: 10,
    width: null,
    height: null,
    ...(transcript === undefined ? {} : { transcript }),
  };
}

function row(text: string, attachments: AssistantAttachment[] = []): QuotableMessage {
  return { id: ID, author: 'Nova', text, attachments };
}

describe('messageQuoteOf', () => {
  it('copies the sender and the words on one line', () => {
    const quote = messageQuoteOf(row('  The   oven\nis on  '));
    expect(quote).toEqual({
      message_id: ID,
      author: 'Nova',
      excerpt: 'The oven is on',
      media_kind: null,
    });
    expect(MESSAGE_QUOTE.parse(quote)).toEqual(quote);
  });

  it('names the kind of the first attachment', () => {
    expect(messageQuoteOf(row('look', [attachment('image/png')])).media_kind).toBe('image');
    expect(messageQuoteOf(row('listen', [attachment('audio/ogg')])).media_kind).toBe('voice');
    expect(messageQuoteOf(row('read', [attachment('application/pdf')])).media_kind).toBe('file');
  });

  it('uses the transcript of a clip that has no text', () => {
    const quote = messageQuoteOf(row('', [attachment('audio/ogg', 'Dinner is ready')]));
    expect(quote.excerpt).toBe('Dinner is ready');
    expect(quote.media_kind).toBe('voice');
  });

  it('keeps an empty excerpt for a bare photo', () => {
    expect(messageQuoteOf(row('', [attachment('image/png')])).excerpt).toBe('');
  });

  it('refuses a quote with an unknown media kind or a bad id', () => {
    const quote = messageQuoteOf(row('hi'));
    expect(MESSAGE_QUOTE.safeParse({ ...quote, media_kind: 'video' }).success).toBe(false);
    expect(MESSAGE_QUOTE.safeParse({ ...quote, message_id: 'x' }).success).toBe(false);
  });
});
