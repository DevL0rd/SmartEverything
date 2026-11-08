import { WATCH_DEBOUNCE_MS, type LiveClientMessageInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveWatchRegistry } from '../../../../store/live-watch';
import { VACUUM_MAP_TOPICS } from './map-demand';

const ROBOT = '33333333-3333-4333-8333-333333333333';

function watching(): { watch: LiveWatchRegistry; sent: LiveClientMessageInput[] } {
  const watch = new LiveWatchRegistry();
  const sent: LiveClientMessageInput[] = [];
  watch.attach((message) => sent.push(message));
  sent.length = 0;
  return { watch, sent };
}

describe('vacuum map demand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the hub for the live view of the robot while a map is held, and stops when released', () => {
    const { watch, sent } = watching();
    const release = watch.hold(ROBOT, VACUUM_MAP_TOPICS);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent).toStrictEqual([
      { type: 'watch', demands: [{ deviceId: ROBOT, topics: ['live'] }] },
    ]);
    release();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent.at(-1)).toStrictEqual({ type: 'watch', demands: [] });
  });

  it('shares one demand between two maps on the same robot', () => {
    const { watch, sent } = watching();
    const first = watch.hold(ROBOT, VACUUM_MAP_TOPICS);
    const second = watch.hold(ROBOT, VACUUM_MAP_TOPICS);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent).toHaveLength(1);
    first();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent).toHaveLength(1);
    second();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent.at(-1)).toStrictEqual({ type: 'watch', demands: [] });
  });

  it('registers the demand again on a new connection after a reconnect', () => {
    const { watch, sent } = watching();
    watch.hold(ROBOT, VACUUM_MAP_TOPICS);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    watch.detach();
    const again: LiveClientMessageInput[] = [];
    watch.attach((message) => again.push(message));
    expect(sent).toHaveLength(1);
    expect(again).toStrictEqual([
      { type: 'watch', demands: [{ deviceId: ROBOT, topics: ['live'] }] },
    ]);
  });
});
