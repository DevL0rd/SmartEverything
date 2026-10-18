import { ROBOT_ONLINE_WINDOW_MS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { DAY_MS, MINUTE_MS } from '../../format/time';
import { robotDay } from './activity-timeline';
import { entryOf } from './robot-fixture';

const NOW = Date.parse('2026-10-18T12:00:00Z');

function at(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * MINUTE_MS).toISOString();
}

describe('the robot day', () => {
  it('spans the last 24 hours ending now', () => {
    const day = robotDay([], NOW);
    expect(day.to).toBe(NOW);
    expect(day.from).toBe(NOW - DAY_MS);
    expect(day.segments).toEqual([]);
    expect(day.talks).toBe(0);
  });

  it('counts a robot as awake for five minutes after each contact', () => {
    const day = robotDay([entryOf(1, 'request', at(60))], NOW);
    expect(day.segments).toEqual([
      {
        start: NOW - 60 * MINUTE_MS,
        end: NOW - 60 * MINUTE_MS + ROBOT_ONLINE_WINDOW_MS,
        state: 'awake',
      },
    ]);
  });

  it('joins contacts that follow each other into one awake stretch', () => {
    const entries = [entryOf(1, 'request', at(60)), entryOf(2, 'request', at(57))];
    const day = robotDay(entries, NOW);
    expect(day.segments).toHaveLength(1);
    expect(day.segments[0]).toMatchObject({
      start: NOW - 60 * MINUTE_MS,
      end: NOW - 57 * MINUTE_MS + ROBOT_ONLINE_WINDOW_MS,
    });
  });

  it('keeps a gap of sleep between contacts more than five minutes apart', () => {
    const entries = [entryOf(1, 'request', at(120)), entryOf(2, 'request', at(30))];
    expect(robotDay(entries, NOW).segments.map((segment) => segment.state)).toEqual([
      'awake',
      'awake',
    ]);
  });

  it('marks the part of an awake stretch spent talking', () => {
    const entries = [
      entryOf(1, 'request', at(60)),
      entryOf(2, 'heard', at(59)),
      entryOf(3, 'said', at(58)),
    ];
    const states = robotDay(entries, NOW).segments.map((segment) => segment.state);
    expect(states).toEqual(['awake', 'talk', 'awake']);
  });

  it('never overlaps segments and keeps them in time order', () => {
    const entries = [
      entryOf(1, 'request', at(200)),
      entryOf(2, 'chat', at(199)),
      entryOf(3, 'action', at(100)),
      entryOf(4, 'heard', at(99)),
      entryOf(5, 'request', at(10)),
    ];
    const { segments } = robotDay(entries, NOW);
    segments.slice(1).forEach((segment, index) => {
      expect(segment.start).toBeGreaterThanOrEqual(segments[index]?.end ?? 0);
    });
  });

  it('clips what started before the window and what runs past now', () => {
    const entries = [entryOf(1, 'request', at(24 * 60 + 2)), entryOf(2, 'request', at(1))];
    const { segments, from, to } = robotDay(entries, NOW);
    expect(segments[0]?.start).toBe(from);
    expect(segments.at(-1)?.end).toBe(to);
  });

  it('ignores warnings, which the robot did not make', () => {
    expect(robotDay([entryOf(1, 'warning', at(10))], NOW).segments).toEqual([]);
  });

  it('counts conversations today, merging lines less than two minutes apart', () => {
    const entries = [
      entryOf(1, 'heard', at(100)),
      entryOf(2, 'said', at(99)),
      entryOf(3, 'heard', at(30)),
    ];
    expect(robotDay(entries, NOW).talks).toBe(2);
  });
});
