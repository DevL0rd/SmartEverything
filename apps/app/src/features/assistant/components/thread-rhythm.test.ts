import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { threadOf } from '../data/thread';
import { CHAT_RHYTHM } from '../model/chat-display';
import { entryLedger } from './rise';
import { ROW_GAP_CLASS, entryOf, rowGapOf } from './thread-rhythm';
import { castOf } from '../model/participant';

const OPTIONS = {
  cast: castOf('Coordinator', null),
  now: Date.parse('2026-11-07T12:00:00.000Z'),
  timeZone: 'UTC',
  unreadAfter: null,
  openedAt: 0,
  hidden: new Set<string>(),
};

function row(
  id: string,
  role: AssistantMessageRow['role'],
  minute: number,
  text = 'hello',
): AssistantMessageRow {
  const at = `2026-11-07T10:${String(minute).padStart(2, '0')}:00.000Z`;
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role,
    kind: 'text',
    author: role === 'person' ? 'Me' : 'AI',
    text,
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
    created_at: at,
    updated_at: at,
  };
}

function gapsOf(rows: readonly AssistantMessageRow[]): readonly string[] {
  const items = threadOf(rows, OPTIONS);
  return items.map((item, index) => `${item.key}:${rowGapOf(item, items[index + 1])}`);
}

describe('rowGapOf', () => {
  it('puts the run gap between senders, the own run gap inside my run and the run inside gap between replies', () => {
    const rows = [
      row('a', 'person', 0),
      row('b', 'person', 1),
      row('c', 'responder', 2),
      row('d', 'responder', 3),
    ];
    expect(gapsOf(rows)).toEqual(['d:insideRun', 'c:betweenRuns', 'b:ownRun', 'a:betweenRuns']);
  });

  it('uses the class whose pixels match each rhythm constant', () => {
    const gaps = ['betweenRuns', 'insideRun', 'ownRun', 'betweenBlocks'] as const;
    for (const gap of gaps) {
      expect(Number(ROW_GAP_CLASS[gap].replace('pt-', '')) * 4).toBe(CHAT_RHYTHM[gap]);
    }
  });
});

describe('entry ledger', () => {
  it('rises a row once, only when it arrived after the thread opened', () => {
    const items = threadOf([row('old', 'person', 0), row('new', 'responder', 5)], OPTIONS);
    const ledger = entryLedger(Date.parse('2026-11-07T10:02:00.000Z'));
    const [newest, oldest] = items.map(entryOf);
    expect(newest === undefined ? null : ledger.claim(newest.identity, newest.at)).toBe(true);
    expect(newest === undefined ? null : ledger.claim(newest.identity, newest.at)).toBe(false);
    expect(oldest === undefined ? null : ledger.claim(oldest.identity, oldest.at)).toBe(false);
  });
});
