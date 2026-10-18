import { describe, expect, it } from 'vitest';
import { chevronsPath, directionAt, ringBox, ringPath } from './ring-geometry';

const box = ringBox(232);

describe('television ring pad', () => {
  it('reads a touch above, below, left and right of the middle as that direction', () => {
    expect(directionAt(box, 116, 20)).toBe('up');
    expect(directionAt(box, 116, 212)).toBe('down');
    expect(directionAt(box, 20, 116)).toBe('left');
    expect(directionAt(box, 212, 116)).toBe('right');
  });

  it('splits the corners along the diagonals', () => {
    expect(directionAt(box, 116 + 50, 116 - 60)).toBe('up');
    expect(directionAt(box, 116 + 60, 116 - 50)).toBe('right');
    expect(directionAt(box, 116 - 60, 116 + 50)).toBe('left');
    expect(directionAt(box, 116 + 50, 116 + 60)).toBe('down');
  });

  it('leaves the middle disc to the OK key', () => {
    expect(directionAt(box, 116, 116)).toBeNull();
    expect(directionAt(box, 116, 116 - 40)).toBeNull();
  });

  it('ignores a touch far outside the ring but accepts the edge padding', () => {
    expect(directionAt(box, 116, -30)).toBeNull();
    expect(directionAt(box, 116, -4)).toBe('up');
  });

  it('keeps the same hit areas at the 96 px card size', () => {
    const small = ringBox(96);
    expect(directionAt(small, 48, 6)).toBe('up');
    expect(directionAt(small, 48, 48)).toBeNull();
  });

  it('draws four wedges and four chevrons', () => {
    expect(ringPath(box).match(/M/g)).toHaveLength(4);
    expect(chevronsPath(box).match(/M/g)).toHaveLength(4);
  });
});
