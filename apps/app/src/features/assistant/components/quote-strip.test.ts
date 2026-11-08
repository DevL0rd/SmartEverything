import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type {
  AssistantAttachment,
  AssistantMessageRow,
  MessageQuote,
} from '@smarteverything/domain';
import { threadOf } from '../data/thread';
import { MentionChip, mentionClass } from './mention-chip';
import { QuoteStrip, miniWavePath, quoteLine, quoteSourceOf } from './quote-strip';
import { castOf } from '../model/participant';

vi.mock('../../../design/colour', () => ({ useColour: (role: string): string => role }));
vi.mock('../data/remote', () => ({
  useAttachmentLinks: (): { readonly data: undefined } => ({ data: undefined }),
}));

const QUOTED = '00000000-0000-4000-8000-000000000010';

const QUOTE: MessageQuote = {
  message_id: QUOTED,
  author: 'Researcher',
  excerpt: 'Tradfri globe: 2200 to 4000 K',
  media_kind: null,
};

const VOICE: AssistantAttachment = {
  id: '00000000-0000-4000-8000-000000000011',
  name: 'voice.m4a',
  mime: 'audio/mp4',
  bytes: 2048,
  width: null,
  height: null,
  levels: Array.from({ length: 240 }, (_, index) => (index * 37) % 256),
};

function own(): AssistantMessageRow {
  return {
    id: QUOTED,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Sam',
    text: 'is the Tradfri fine?',
    attachments: [VOICE],
    state: 'answered',
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    chat_id: '00000000-0000-4000-8000-000000000003',
    origin: { source: 'app', plugin_id: null, device_id: null, name: 'Sam' },
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: '2026-11-07T10:00:00.000Z',
    updated_at: '2026-11-07T10:00:00.000Z',
  };
}

const OPTIONS = {
  cast: castOf('Coordinator', null),
  now: Date.parse('2026-11-07T12:00:00.000Z'),
  timeZone: 'UTC',
  unreadAfter: null,
  openedAt: 0,
  hidden: new Set<string>(),
};

describe('quoteSourceOf', () => {
  it('names my own quoted message You with my ink and its attachment', () => {
    const original = threadOf([own()], OPTIONS)[0] ?? null;
    const source = quoteSourceOf(QUOTE, original, false);
    expect(source).toMatchObject({ kind: 'shown', name: 'You', attachment: VOICE });
  });

  it('keeps the stored author when the original is not loaded, and marks a removed one deleted', () => {
    expect(quoteSourceOf(QUOTE, null, false)).toMatchObject({
      kind: 'shown',
      name: 'Researcher',
      attachment: null,
    });
    expect(quoteSourceOf(QUOTE, null, true)).toEqual({ kind: 'deleted' });
  });
});

describe('quoteLine', () => {
  it('describes each quoted media kind on one line', () => {
    expect(quoteLine({ ...QUOTE, media_kind: 'image', excerpt: '' }, null)).toBe('Photo');
    expect(quoteLine({ ...QUOTE, media_kind: 'voice', excerpt: '' }, VOICE)).toBe('Voice · 0:12');
    expect(quoteLine({ ...QUOTE, media_kind: 'file', excerpt: '' }, null)).toBe('File');
    expect(quoteLine(QUOTE, null)).toBe(QUOTE.excerpt);
  });

  it('draws one bar per slot of the mini wave from the stored peaks', () => {
    expect(miniWavePath(VOICE.levels ?? []).match(/M/g)).toHaveLength(10);
  });
});

describe('QuoteStrip', () => {
  it('shows the sender in ink with a one line excerpt', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteStrip, {
        quote: QUOTE,
        source: { kind: 'shown', name: 'Researcher', ink: 'viz-1', attachment: null },
      }),
    );
    expect(markup).toContain('Researcher');
    expect(markup).toContain(QUOTE.excerpt);
    expect(markup).toContain('Quoting Researcher');
  });

  it('shows a faint deleted name and keeps the stored excerpt', () => {
    const markup = renderToStaticMarkup(
      createElement(QuoteStrip, { quote: QUOTE, source: { kind: 'deleted' } }),
    );
    expect(markup).toContain('deleted');
    expect(markup).toContain(QUOTE.excerpt);
  });
});

describe('MentionChip', () => {
  it('uses the ink fill for others and the primary fill for a self mention', () => {
    expect(mentionClass('viz-3', false)).toContain('bg-viz-3/13');
    expect(mentionClass('viz-3', true)).toContain('bg-primary/22');
    const markup = renderToStaticMarkup(
      createElement(MentionChip, { text: '@Planner', ink: 'viz-3', self: false }),
    );
    expect(markup).toContain('@Planner');
  });
});
