import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { threadOf } from '../data/thread';
import { JumpPill, jumpOf } from './jump-pill';
import { ThreadMarkers } from './thread-markers';
import { castOf } from '../model/participant';

vi.mock('../../../design/colour', () => ({ useColour: (role: string): string => role }));
vi.mock('../call/orb', () => ({
  AssistantOrb: (): ReactNode => createElement('span', null, 'orb'),
}));
vi.mock('./rise', () => ({
  Rise: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));

const CHAT = '00000000-0000-4000-8000-000000000003';

function message(
  id: string,
  minute: number,
  patch: Partial<AssistantMessageRow> = {},
): AssistantMessageRow {
  const at = new Date(Date.parse('2026-11-07T10:00:00.000Z') + minute * 60_000).toISOString();
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Sam',
    text: `message ${id}`,
    attachments: [],
    state: 'answered',
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    chat_id: CHAT,
    origin: { source: 'app', plugin_id: null, device_id: null, name: 'Sam' },
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: at,
    updated_at: at,
    ...patch,
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

const REPLY = { role: 'responder', author: 'Coordinator' } as const;

function rows(): ReturnType<typeof threadOf> {
  return threadOf(
    [
      message('00000000-0000-4000-8000-000000000010', 1),
      message('00000000-0000-4000-8000-000000000011', 2, REPLY),
      message('00000000-0000-4000-8000-000000000012', 3, REPLY),
      message('00000000-0000-4000-8000-000000000013', 80, {
        origin: { source: 'voice', plugin_id: null, device_id: null, name: 'Sam' },
      }),
    ],
    OPTIONS,
  );
}

describe('jumpOf', () => {
  it('counts the messages above the anchor and names the newest other sender', () => {
    const jump = jumpOf(rows(), '00000000-0000-4000-8000-000000000010');
    expect(jump.count).toBe(3);
    expect(jump.sender).toMatchObject({ kind: 'assistant', name: 'Coordinator' });
  });

  it('shows nothing new at rest or when the anchor is gone', () => {
    expect(jumpOf(rows(), '00000000-0000-4000-8000-000000000013')).toEqual({
      count: 0,
      sender: null,
    });
    expect(jumpOf(rows(), null)).toEqual({ count: 0, sender: null });
    expect(jumpOf(rows(), 'missing')).toEqual({ count: 0, sender: null });
  });

  it('keeps the count but no avatar when only my own messages arrived', () => {
    const jump = jumpOf(rows(), '00000000-0000-4000-8000-000000000012');
    expect(jump).toEqual({ count: 1, sender: null });
  });
});

describe('JumpPill', () => {
  it('speaks the count and the newest sender, and is a plain arrow at rest', () => {
    const fresh = renderToStaticMarkup(
      createElement(JumpPill, {
        jump: jumpOf(rows(), '00000000-0000-4000-8000-000000000010'),
        onPress: (): undefined => undefined,
      }),
    );
    expect(fresh).toContain('Jump to 3 new messages, newest from Coordinator');
    expect(fresh).toContain('>3<');
    expect(fresh).toContain('orb');
    const rest = renderToStaticMarkup(
      createElement(JumpPill, {
        jump: { count: 0, sender: null },
        onPress: (): undefined => undefined,
      }),
    );
    expect(rest).toContain('Jump to latest');
    expect(rest).not.toContain('orb');
    expect(rest).not.toContain('>0<');
  });
});

describe('ThreadMarkers', () => {
  it('prints the day as a plain caption, the unread line and the time gap only in solo', () => {
    const [newest] = rows();
    if (newest === undefined) throw new Error('Expected a row.');
    const gap = newest.gap;
    if (gap === null) throw new Error('Expected a time gap.');
    const solo = renderToStaticMarkup(
      createElement(ThreadMarkers, { item: { ...newest, day: 'Today', divider: true } }),
    );
    expect(solo).toContain('Today');
    expect(solo).toContain('New');
    expect(solo).toContain(gap);
    const group = renderToStaticMarkup(
      createElement(ThreadMarkers, { item: { ...newest, group: true } }),
    );
    expect(group).not.toContain(gap);
  });
});
