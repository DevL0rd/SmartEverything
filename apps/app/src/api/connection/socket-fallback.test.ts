import { describe, expect, it } from 'vitest';
import { afterSocketAttempt, socketRouteFor } from './socket-fallback';

describe('the socket route fallback', () => {
  it('starts on the primary route and stays there after one failure', () => {
    const state = afterSocketAttempt(socketRouteFor(null, 'lan'), false);
    expect(state).toEqual({ key: 'lan', route: 'primary', failures: 1 });
  });

  it('switches to the fallback after two failures in a row', () => {
    const start = socketRouteFor(null, 'lan');
    const state = afterSocketAttempt(afterSocketAttempt(start, false), false);
    expect(state.route).toBe('fallback');
    expect(state.failures).toBe(0);
  });

  it('forgets a failure once a socket opens', () => {
    const start = socketRouteFor(null, 'lan');
    const state = afterSocketAttempt(
      afterSocketAttempt(afterSocketAttempt(start, false), true),
      false,
    );
    expect(state.route).toBe('primary');
  });

  it('keeps the fallback while it opens and returns to the primary when it fails twice', () => {
    const start = socketRouteFor(null, 'lan');
    const switched = afterSocketAttempt(afterSocketAttempt(start, false), false);
    expect(afterSocketAttempt(switched, true).route).toBe('fallback');
    expect(afterSocketAttempt(afterSocketAttempt(switched, false), false).route).toBe('primary');
  });

  it('starts over on the primary route when the network changes', () => {
    const start = socketRouteFor(null, 'lan|1');
    const switched = afterSocketAttempt(afterSocketAttempt(start, false), false);
    expect(socketRouteFor(switched, 'lan|1')).toBe(switched);
    expect(socketRouteFor(switched, 'lan|2')).toEqual({
      key: 'lan|2',
      route: 'primary',
      failures: 0,
    });
  });
});
