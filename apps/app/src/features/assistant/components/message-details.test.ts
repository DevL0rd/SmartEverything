import type { AssistantMessageRow } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface Content {
  readonly children?: ReactNode;
  readonly value?: string;
  readonly title?: string;
}

const Box = ({ children }: Content): ReactNode => createElement('div', null, children);

vi.mock('react-native', () => ({ View: Box }));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: Content): ReactNode => createElement('span', null, children),
}));
vi.mock('../../../components/figure', () => ({
  Figure: ({ value }: Content): ReactNode => createElement('b', null, value),
}));
vi.mock('../../../components/charts/bars', () => ({ Bars: (): null => null }));
vi.mock('../../../components/list-row', () => ({
  ListRow: ({ title }: Content): ReactNode => createElement('a', null, title),
}));
vi.mock('../../../components/sheet', () => ({ Sheet: Box }));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => 0 }));
vi.mock('../../../store/store-context', () => ({ useStoreSelector: (): null => null }));
vi.mock('../../region', () => ({
  useMoney: (): object => ({
    cost: (micros: number): string => `$${String(micros / 1e6)}`,
    format: { currency: 'USD' },
  }),
  moneyNoteOf: (): null => null,
}));
vi.mock('../data/chat-store', () => ({
  useAiChat: (): object => ({
    engine: { kind: 'dsh' },
    cost_micros: 9000,
    cost_incomplete: false,
  }),
  useChatMessages: (): readonly [] => [],
}));
vi.mock('../data/history', () => ({
  mergedRows: (): readonly [] => [],
  useOlderRows: (): readonly [] => [],
}));
vi.mock('../data/plugin-names', () => ({
  usePluginNames: (): ReadonlyMap<string, string> => new Map(),
}));
vi.mock('../picker/model-queries', () => ({ useModelRow: (): object => ({ data: undefined }) }));
vi.mock('../provider/computer-engine', () => ({ isComputerEngine: (): boolean => false }));
vi.mock('../provider/subscription-usage', () => ({ ChatSubscriptionUsage: (): null => null }));

const { MessageDetails } = await import('./message-details');

const REPLY: AssistantMessageRow = {
  id: '00000000-0000-4000-8000-0000000000a1',
  profile_id: '00000000-0000-4000-8000-000000000002',
  client_id: null,
  role: 'responder',
  kind: 'text',
  author: 'AI',
  text: 'Done',
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
  origin: { source: 'app', plugin_id: null, device_id: null, name: 'AI' },
  embeds: [],
  cost_micros: 6000,
  model: null,
  created_at: '2026-10-09T13:41:00.000Z',
  updated_at: '2026-10-09T13:41:04.000Z',
};

function render(): string {
  return renderToStaticMarkup(
    createElement(MessageDetails, { row: REPLY, open: true, onClose: () => undefined }),
  );
}

describe('message details', () => {
  it('shows the reply cost once, as its figure', () => {
    const markup = render();
    expect(markup.split('$0.006').length - 1).toBe(1);
    expect(markup).toContain('<b>$0.006</b>');
    expect(markup).toContain('$0.009');
  });

  it('names where the message came from without repeating From', () => {
    const markup = render();
    expect(markup).toContain('<span>Sent</span>');
    expect(markup).toContain('From the app · AI');
    expect(markup).not.toMatch(/From<\/span>.*From the app/);
  });
});
