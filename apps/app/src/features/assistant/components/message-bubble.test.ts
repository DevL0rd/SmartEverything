import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { threadOf, type MessageItem } from '../data/thread';
import { castOf } from '../model/participant';

interface Animated {
  readonly children?: ReactNode;
  readonly exiting?: unknown;
}

const seen = vi.hoisted((): { exits: unknown[]; reduced: boolean } => ({
  exits: [],
  reduced: false,
}));

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('div', null, children),
}));
vi.mock('react-native-reanimated', () => ({
  default: {
    View: ({ children, exiting }: Animated): ReactNode => {
      seen.exits.push(exiting);
      return createElement('div', null, children);
    },
  },
  FadeIn: { duration: (): string => 'fade-in' },
  FadeOut: { duration: (): string => 'fade-out' },
}));
vi.mock('../../../design/motion', () => ({
  useMotion: (): { readonly reduced: boolean } => ({ reduced: seen.reduced }),
  exiting: (motion: { readonly reduced: boolean }, animation: unknown): object =>
    motion.reduced ? {} : { exiting: animation },
}));
vi.mock('../../../design/animation-gate', () => ({}));
vi.mock('../../../design/viewport', () => ({}));
vi.mock('./call-card', () => ({ CallCard: (): null => null }));
vi.mock('./my-message', () => ({ MyMessage: (): null => null }));
vi.mock('./participant-message', () => ({ ParticipantMessage: (): null => null }));
vi.mock('./system-event', () => ({
  SystemEvent: (): null => null,
  systemEventOf: (): null => null,
}));
vi.mock('./thread-markers', () => ({ ThreadMarkers: (): null => null }));
vi.mock('./thread-motion', () => ({ REPLY_SINK: 'reply-sink', ROW_EXIT: 'row-exit' }));

const { MessageBubble } = await import('./message-bubble');
const { RowScope, RowVisibility } = await import('../../../components/virtual-list-visibility');

const ROW: AssistantMessageRow = {
  id: 'row-1',
  profile_id: '00000000-0000-4000-8000-000000000002',
  client_id: null,
  role: 'person',
  kind: 'text',
  author: 'Me',
  text: 'check the lights',
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
  created_at: '2026-11-07T10:00:00.000Z',
  updated_at: '2026-11-07T10:00:00.000Z',
};

function messageItem(): MessageItem {
  const options = {
    cast: castOf('Coordinator', null),
    now: Date.parse('2026-11-07T12:00:00.000Z'),
    timeZone: 'UTC',
    unreadAfter: null,
    openedAt: 0,
    hidden: new Set<string>(),
  };
  const [item] = threadOf([ROW], options);
  if (item === undefined) throw new Error('no message item');
  return item;
}

function exitsFor(viewable: ReadonlySet<string> | null): unknown[] {
  const rows = new RowVisibility();
  if (viewable !== null) rows.replace(viewable);
  seen.exits = [];
  const scope = {
    rows,
    rowKey: 'row-1',
    children: createElement(MessageBubble, { item: messageItem(), flash: true }),
  };
  renderToStaticMarkup(createElement(RowScope, scope));
  return seen.exits;
}

describe('MessageBubble exit animation', () => {
  beforeEach(() => {
    seen.reduced = false;
  });

  it('keeps the row and flash exits while the row is in the viewable set', () => {
    expect(exitsFor(new Set(['row-1']))).toEqual(['row-exit', 'fade-out']);
  });

  it('drops every exit once the row leaves the viewable set, so a virtualized unmount clones nothing', () => {
    expect(exitsFor(new Set(['row-2']))).toEqual([undefined, undefined]);
  });

  it('drops every exit under reduced motion', () => {
    seen.reduced = true;
    expect(exitsFor(new Set(['row-1']))).toEqual([undefined, undefined]);
  });
});
