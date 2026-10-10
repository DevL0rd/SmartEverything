import { describe, expect, it } from 'vitest';
import { playTime } from './time';

describe('writing a clip length', () => {
  it('writes minutes and seconds', () => {
    expect(playTime(15)).toBe('0:15');
    expect(playTime(75.4)).toBe('1:15');
  });

  it('adds hours for long clips', () => {
    expect(playTime(3725)).toBe('1:02:05');
  });

  it('never goes below zero', () => {
    expect(playTime(-3)).toBe('0:00');
  });
});
