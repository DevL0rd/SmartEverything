import { describe, expect, it } from 'vitest';
import { readScene } from './scene-state';
import { LAMP } from './test-devices';

const ACTIONS = [{ type: 'command', deviceId: LAMP, capability: 'brightness', value: 10 }];

describe('reading a stored scene', () => {
  it('parses a row once and returns the same reading on every later read', () => {
    const row = { name: 'Movie', icon: 'film', actions: ACTIONS };
    const first = readScene(row);
    expect(first.readable).toBe(true);
    expect(readScene(row)).toBe(first);
  });

  it('keeps an unreadable row unreadable and names the scene in the problem', () => {
    const row = { name: 'Broken', icon: 'film', actions: [{ type: 'nonsense' }] };
    const first = readScene(row);
    expect(first.readable).toBe(false);
    expect(first.readable ? '' : first.problem).toContain('Broken');
    expect(readScene(row)).toBe(first);
  });

  it('reads a different row object on its own even when the content is equal', () => {
    const left = { name: 'Movie', icon: 'film', actions: ACTIONS };
    const right = { name: 'Movie', icon: 'film', actions: ACTIONS };
    expect(readScene(right)).not.toBe(readScene(left));
    expect(readScene(right)).toStrictEqual(readScene(left));
  });
});
