import { describe, expect, it } from 'vitest';
import { shouldHop } from './robot-hop';

const MOVE = '2026-10-18T10:00:00.000Z';
const NEXT = '2026-10-18T10:05:00.000Z';

describe('the robot hop', () => {
  it('hops for a move that arrives while the robot is on screen', () => {
    expect(shouldHop({ seen: MOVE, at: NEXT, playing: true })).toBe(true);
  });

  it('does not hop for the move that was already there when it appeared', () => {
    expect(shouldHop({ seen: MOVE, at: MOVE, playing: true })).toBe(false);
  });

  it('does not hop while off screen, idle or offline', () => {
    expect(shouldHop({ seen: MOVE, at: NEXT, playing: false })).toBe(false);
  });

  it('does not hop when there has been no move', () => {
    expect(shouldHop({ seen: null, at: null, playing: true })).toBe(false);
  });

  it('hops for the first move ever seen', () => {
    expect(shouldHop({ seen: null, at: MOVE, playing: true })).toBe(true);
  });
});
