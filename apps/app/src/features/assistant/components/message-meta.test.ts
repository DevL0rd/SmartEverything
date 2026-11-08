import type { AssistantMessageRow } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface Content {
  readonly children?: ReactNode;
  readonly label?: string;
  readonly accessibilityLabel?: string;
  readonly tone?: string;
}

vi.mock('react-native', () => ({
  View: ({ children }: Content): ReactNode => createElement('div', null, children),
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children, tone }: Content): ReactNode =>
    createElement('span', { 'data-tone': tone }, children),
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/interactive', () => ({
  Interactive: ({ children, label }: Content): ReactNode =>
    createElement('button', { 'aria-label': label }, children),
}));
vi.mock('../../region', () => ({
  useMoney: (): object => ({ cost: (micros: number): string => `$${String(micros / 1e6)}` }),
}));
vi.mock('../data/assistant-data', () => ({ useAssistantStatus: (): null => null }));
vi.mock('../data/chat-store', () => ({ useAiChat: (): null => null }));
vi.mock('../data/retry', () => ({ useCanContinue: (): boolean => false }));
vi.mock('../data/send', () => ({ continueMessage: (): Promise<void> => Promise.resolve() }));
vi.mock('../provider/computer-engine', () => ({ isComputerEngine: (): boolean => false }));
vi.mock('../voice-message/voice-pill-transcript-state', () => ({
  useVoiceTranscript: (): null => null,
}));
vi.mock('./message-parts', () => ({ useTimeZone: (): string => 'UTC' }));

const { ReplyMeta, MyMeta } = await import('./message-meta');
const { threadOf } = await import('../data/thread');
const { castOf } = await import('../model/participant');
const { clock } = await import('../../../format/time');

const OPTIONS = {
  cast: castOf('My coordinator', null),
  now: Date.parse('2026-10-09T12:00:00.000Z'),
  timeZone: 'UTC',
  unreadAfter: null,
  openedAt: 0,
  hidden: new Set<string>(),
};

function row(id: string, role: AssistantMessageRow['role'], at: string): AssistantMessageRow {
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role,
    kind: 'text',
    author: role === 'person' ? 'Me' : 'AI',
    text: 'hello',
    attachments: [],
    state: 'failed',
    reason: null,
    reason_code: 'stopped',
    client_message_id: null,
    steps: role === 'responder' ? ['Find kitchen lights'] : [],
    step_states: [],
    reply_to: null,
    quote: null,
    chat_id: '00000000-0000-4000-8000-000000000003',
    origin: { source: 'app', plugin_id: null, device_id: null, name: 'Me' },
    embeds: [],
    cost_micros: role === 'responder' ? 2000 : 0,
    model: null,
    created_at: `2026-10-09T13:4${at}:00.000Z`,
    updated_at: `2026-10-09T13:4${at}:00.000Z`,
  };
}

const FIND_LIGHTS = {
  kind: 'chat_timeline',
  version: 1,
  parts: [
    {
      kind: 'tool',
      key: 't1',
      tool: {
        callId: 't1',
        name: 'device_find',
        title: 'Find kitchen lights',
        state: 'done',
        detail: null,
        input: null,
        output: null,
        redacted: false,
        image_operation_id: null,
      },
    },
  ],
} as const;

function itemOf(
  rows: readonly AssistantMessageRow[],
  id: string,
): Parameters<typeof MyMeta>[0]['item'] {
  const found = threadOf(rows, OPTIONS).find((item) => item.row.id === id);
  if (found === undefined) throw new Error(`no message ${id}`);
  return found;
}

describe('stopped turn meta', () => {
  it('lists time, tools and cost without repeating Stopped when the activity line shows it', () => {
    const request = row('q', 'person', '0');
    const reply = { ...row('a', 'responder', '1'), reply_to: 'q', embeds: [FIND_LIGHTS] };
    const markup = renderToStaticMarkup(
      createElement(ReplyMeta, { item: itemOf([request, reply], 'a'), onPress: () => undefined }),
    );
    const words = [...markup.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((match) => match[1]);
    expect(words.filter((word) => word !== '·')).toEqual([
      clock('2026-10-09T13:41:00.000Z', 'UTC'),
      '1 tool',
      '$0.002',
    ]);
  });

  it('keeps Stopped on the meta line of a stopped reply without tools', () => {
    const request = row('q', 'person', '0');
    const reply = { ...row('a', 'responder', '1'), reply_to: 'q', steps: [] };
    const markup = renderToStaticMarkup(
      createElement(ReplyMeta, { item: itemOf([request, reply], 'a'), onPress: () => undefined }),
    );
    expect(markup).toContain('data-tone="variant">Stopped');
  });

  it('marks an own request stopped before any reply on its own meta line', () => {
    const markup = renderToStaticMarkup(
      createElement(MyMeta, { item: itemOf([row('q', 'person', '0')], 'q') }),
    );
    expect(markup).toContain(clock('2026-10-09T13:40:00.000Z', 'UTC'));
    expect(markup).toContain('>Stopped</span>');
  });
});
