import { describe, expect, it } from 'vitest';
import { APP_SOURCE } from '../model/chat-source';
import { sectionsOf, type ChatEntry } from './chat-entry';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');
const HOUR = 3_600_000;

function entry(id: string, at: string, change: Partial<ChatEntry> = {}): ChatEntry {
  return {
    id,
    kind: 'chat',
    title: id,
    source: APP_SOURCE,
    at,
    pinned: false,
    archived: false,
    unread: 0,
    requests: 0,
    parentId: null,
    runtime: null,
    computerId: null,
    line: { kind: 'empty' },
    ...change,
  };
}

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * HOUR).toISOString();
}

function formatCalls(run: () => void): number {
  const prototype = Intl.DateTimeFormat.prototype;
  const original = Object.getOwnPropertyDescriptor(prototype, 'format');
  const read: unknown = original === undefined ? undefined : Reflect.get(original, 'get');
  if (original === undefined || typeof read !== 'function') {
    throw new Error('Intl.DateTimeFormat.prototype.format is not an accessor');
  }
  let calls = 0;
  Object.defineProperty(prototype, 'format', {
    ...original,
    get(this: Intl.DateTimeFormat): unknown {
      calls += 1;
      return Reflect.apply(read, this, []);
    },
  });
  try {
    run();
  } finally {
    Object.defineProperty(prototype, 'format', original);
  }
  return calls;
}

describe('chat list sections', () => {
  it('puts each chat under its day heading, newest first, pinned on top', () => {
    const pool = [
      entry('old', hoursAgo(24 * 30)),
      entry('week', hoursAgo(24 * 4)),
      entry('yesterday', hoursAgo(30)),
      entry('now', hoursAgo(1)),
      entry('later', hoursAgo(3)),
      entry('pinned', hoursAgo(24 * 9), { pinned: true }),
    ];
    const sections = sectionsOf(pool, pool, { now: NOW, timeZone: 'UTC' });
    expect(
      sections.map((section) => [section.title, section.data.map((family) => family.entry.id)]),
    ).toEqual([
      ['Pinned', ['pinned']],
      ['Today', ['now', 'later']],
      ['Yesterday', ['yesterday']],
      ['Previous 7 days', ['week']],
      ['Older', ['old']],
    ]);
  });

  it('reads the day of a chat once, however many headings exist', () => {
    const pool = Array.from({ length: 60 }, (_, index) =>
      entry(`chat-${String(index)}`, hoursAgo(index * 5)),
    );
    const calls = formatCalls(() => {
      sectionsOf(pool, pool, { now: NOW, timeZone: 'UTC' });
    });
    expect(calls).toBeLessThanOrEqual(pool.length + 2);
  });
});
