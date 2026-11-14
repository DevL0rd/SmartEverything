import { describe, expect, it } from 'vitest';
import {
  checkStateOf,
  drivePathOfWire,
  insideExcluded,
  keptSplitOf,
  sameExcluded,
  toggledExcluded,
  wirePathOf,
} from './excluded-model';

describe('selective sync as excluded folders', () => {
  it('ticks kept folders, unticks excluded ones and marks parents of excluded ones as mixed', () => {
    const excluded = ['Films/Raw'];
    expect(checkStateOf('Films/Raw', excluded)).toBe(false);
    expect(checkStateOf('Films/Raw/2024', excluded)).toBe(false);
    expect(checkStateOf('Films', excluded)).toBe('mixed');
    expect(checkStateOf('Music', excluded)).toBe(true);
    expect(insideExcluded('Films/Raw/2024', excluded)).toBe(true);
    expect(insideExcluded('Films/Raw', excluded)).toBe(false);
  });

  it('excluding a folder replaces the exclusions inside it, keeping it again removes them', () => {
    const inside = ['Films/Raw', 'Films/Old'];
    expect(toggledExcluded(inside, 'Films', false)).toEqual(['Films']);
    expect(toggledExcluded(['Films'], 'Films', true)).toEqual([]);
    expect(toggledExcluded(['Music'], 'Films/Raw', false)).toEqual(['Films/Raw', 'Music']);
  });

  it('converts between drive paths and paths relative to the placed folder', () => {
    expect(wirePathOf('Projects', 'Projects/Raw')).toBe('Raw');
    expect(wirePathOf(null, 'Projects/Raw')).toBe('Projects/Raw');
    expect(drivePathOfWire('Projects', 'Raw')).toBe('Projects/Raw');
    expect(sameExcluded(['b', 'a'], ['a', 'b', 'a/c'])).toBe(true);
  });

  it('splits the folder into what stays here and what stays on the Hub', () => {
    const sizes = new Map([['Films', 60]]);
    expect(keptSplitOf(100, ['Films'], sizes)).toEqual({ kept: 40, excluded: 60 });
    expect(keptSplitOf(100, ['Unknown'], sizes)).toBeNull();
  });
});
