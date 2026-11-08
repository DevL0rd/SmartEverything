import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import {
  CHAT_RHYTHM,
  GROUP_GUTTER,
  activityExpanded,
  replyStatsOf,
  runStatsOf,
} from './chat-display';

describe('chat display constants', () => {
  it('holds the rhythm and the group gutter from the design', () => {
    expect(CHAT_RHYTHM).toMatchObject({ betweenRuns: 16, insideRun: 4, betweenBlocks: 8 });
    expect(CHAT_RHYTHM.metaAbove).toBe(3);
    expect(CHAT_RHYTHM.metaHeight).toBe(16);
    expect(GROUP_GUTTER).toBe(32);
  });

  it('keeps activity open while live and closed when done', () => {
    expect(activityExpanded(true)).toBe(true);
    expect(activityExpanded(false)).toBe(false);
  });
});

function reply(patch: Partial<AssistantMessageRow> = {}): AssistantMessageRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
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
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: 'm',
    created_at: '2026-10-09T10:00:00.000Z',
    updated_at: '2026-10-09T10:00:08.200Z',
    ...patch,
  };
}

describe('runStatsOf', () => {
  it('adds up the duration, tools and cost of every reply in a run', () => {
    const stats = runStatsOf([
      reply({ steps: ['Search', 'Read'], cost_micros: 2000 }),
      reply({ cost_micros: 4000, updated_at: '2026-10-09T10:00:01.800Z' }),
    ]);
    expect(stats).toEqual({
      durationMs: 10000,
      tools: 2,
      cost: { model: 'm', cost_micros: 6000, cost_incomplete: false },
    });
  });

  it('counts nothing for my rows or a reply still working, and marks unreported cost', () => {
    const stats = runStatsOf([
      reply({ role: 'person', steps: ['x'] }),
      reply({ state: 'working', steps: ['y'], model: null }),
      reply({ cost_micros: 3000 }),
      reply({ cost_micros: 0 }),
    ]);
    expect(stats.tools).toBe(0);
    expect(stats.durationMs).toBe(16400);
    expect(stats.cost).toMatchObject({ cost_micros: 3000, cost_incomplete: true });
  });
});

describe('replyStatsOf', () => {
  const seconds = (ms: number): string => `${String(ms / 1000)} s`;
  const cost = { model: null, cost_micros: 0, cost_incomplete: false };
  const stats = { durationMs: 8000, tools: 3, cost };

  it('shows the time, tools and duration of a settled solo turn', () => {
    expect(
      replyStatsOf({ group: false, state: 'answered', stopped: false, stats }, '13:41', seconds),
    ).toEqual(['13:41', '3 tools', '8 s']);
    expect(
      replyStatsOf(
        { group: false, state: 'answered', stopped: false, stats: { ...stats, tools: 1 } },
        '13:41',
        seconds,
      ),
    ).toContain('1 tool');
  });

  it('leaves the time to the error line of a failed reply', () => {
    const empty = { durationMs: null, tools: 0, cost };
    expect(
      replyStatsOf({ group: false, state: 'failed', stopped: false, stats }, '13:41', seconds),
    ).toEqual(['3 tools', '8 s']);
    expect(
      replyStatsOf(
        { group: false, state: 'failed', stopped: false, stats: empty },
        '13:41',
        seconds,
      ),
    ).toEqual([]);
  });

  it('keeps the time of a stopped turn on its one meta line', () => {
    expect(
      replyStatsOf({ group: false, state: 'failed', stopped: true, stats }, '13:41', seconds),
    ).toEqual(['13:41', '3 tools', '8 s']);
  });

  it('drops the time in a group, where the run header carries it', () => {
    const empty = { durationMs: null, tools: 0, cost };
    expect(
      replyStatsOf(
        { group: true, state: 'answered', stopped: false, stats: empty },
        '13:41',
        seconds,
      ),
    ).toEqual([]);
  });
});
