import { describe, expect, it } from 'vitest';
import { reuseItems, type ActivityItem } from './coalesce';

function item(id: string, summary = 'Turned on'): ActivityItem {
  return {
    id,
    at: '2026-01-01T10:00:00.000Z',
    since: '2026-01-01T10:00:00.000Z',
    deviceId: 'device-1',
    name: 'Lamp',
    summary,
    by: null,
    icon: 'bulb',
    tone: 'default',
    category: 'devices',
    count: 1,
    failed: false,
  };
}

describe('reuseItems', () => {
  it('returns the previous list when nothing changed', () => {
    const previous = [item('a'), item('b')];
    expect(reuseItems(previous, [item('a'), item('b')])).toBe(previous);
  });

  it('keeps unchanged item objects and replaces changed ones', () => {
    const previous = [item('a'), item('b')];
    const next = [item('a'), item('b', 'Turned off')];
    const shared = reuseItems(previous, next);
    expect(shared).not.toBe(previous);
    expect(shared[0]).toBe(previous[0]);
    expect(shared[1]).toBe(next[1]);
  });

  it('follows a new order and length', () => {
    const previous = [item('a'), item('b')];
    const shared = reuseItems(previous, [item('c'), item('a')]);
    expect(shared.map((entry) => entry.id)).toEqual(['c', 'a']);
    expect(shared[1]).toBe(previous[0]);
  });
});
