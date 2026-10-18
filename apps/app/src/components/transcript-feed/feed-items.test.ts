import type { TranscriptHit, TranscriptSession } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { feedItems, sessionRemovable } from './feed-items';

const ZONE = 'UTC';

function session(id: string, over: Partial<TranscriptSession> = {}): TranscriptSession {
  return {
    id,
    source: 'camera',
    source_id: 'cam-1',
    plugin_id: null,
    title: 'Porch',
    retention_days: null,
    started_at: '2026-10-15T20:00:00.000Z',
    ended_at: null,
    last_line_at: null,
    line_count: 3,
    participants: [],
    ...over,
  };
}

function hit(id: number, at: string, owner: TranscriptSession): TranscriptHit {
  return {
    session: owner,
    line: {
      id,
      session_id: owner.id,
      at,
      speaker_id: null,
      speaker: 'Someone',
      text: `line ${String(id)}`,
      bot: false,
    },
  };
}

const FIRST = session('11111111-1111-4111-8111-111111111111');
const SECOND = session('22222222-2222-4222-8222-222222222222');

describe('feedItems', () => {
  it('puts one day header above the first line of each day, newest first', () => {
    const rows = [
      hit(4, '2026-10-16T09:00:00.000Z', FIRST),
      hit(3, '2026-10-16T08:00:00.000Z', FIRST),
      hit(2, '2026-10-15T23:00:00.000Z', FIRST),
    ];
    const items = feedItems(rows, { timeZone: ZONE, grouped: false });
    expect(items.map((item) => item.kind)).toStrictEqual(['day', 'line', 'line', 'day', 'line']);
  });

  it('starts a day where the viewer’s own midnight falls', () => {
    const rows = [
      hit(2, '2026-10-16T00:30:00.000Z', FIRST),
      hit(1, '2026-10-15T23:30:00.000Z', FIRST),
    ];
    expect(
      feedItems(rows, { timeZone: 'UTC', grouped: false }).map((item) => item.kind),
    ).toStrictEqual(['day', 'line', 'day', 'line']);
    expect(
      feedItems(rows, { timeZone: 'Asia/Tokyo', grouped: false }).map((item) => item.kind),
    ).toStrictEqual(['day', 'line', 'line']);
  });

  it('adds a session header for a single source and repeats it under a new day', () => {
    const rows = [
      hit(3, '2026-10-16T01:00:00.000Z', FIRST),
      hit(2, '2026-10-15T23:00:00.000Z', FIRST),
      hit(1, '2026-10-15T22:00:00.000Z', SECOND),
    ];
    const items = feedItems(rows, { timeZone: ZONE, grouped: true });
    expect(items.map((item) => item.kind)).toStrictEqual([
      'day',
      'session',
      'line',
      'day',
      'session',
      'line',
      'session',
      'line',
    ]);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });

  it('leaves session headers out when several sources are mixed in time', () => {
    const rows = [
      hit(2, '2026-10-16T09:00:00.000Z', FIRST),
      hit(1, '2026-10-16T08:00:00.000Z', SECOND),
    ];
    const items = feedItems(rows, { timeZone: ZONE, grouped: false });
    expect(items.some((item) => item.kind === 'session')).toBe(false);
  });
});

describe('sessionRemovable', () => {
  it('lets a camera transcript go at any time but a conversation only once it ended', () => {
    expect(sessionRemovable(session('a', { source: 'camera', ended_at: null }))).toBe(true);
    expect(sessionRemovable(session('a', { source: 'plugin', ended_at: null }))).toBe(false);
    expect(
      sessionRemovable(session('a', { source: 'plugin', ended_at: '2026-10-16T10:00:00.000Z' })),
    ).toBe(true);
  });
});
