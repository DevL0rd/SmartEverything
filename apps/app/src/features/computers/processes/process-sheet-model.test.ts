import { describe, expect, it } from 'vitest';
import { belongsTo, priorityOf } from './process-sheet-model';

describe('priorityOf', () => {
  it('maps the nice value to the nearest level', () => {
    expect(priorityOf(null)).toBe('normal');
    expect(priorityOf(0)).toBe('normal');
    expect(priorityOf(-5)).toBe('normal');
    expect(priorityOf(10)).toBe('low');
    expect(priorityOf(19)).toBe('lowest');
    expect(priorityOf(15)).toBe('lowest');
  });
});

describe('belongsTo', () => {
  it('says whose program it is', () => {
    expect(belongsTo('root')).toBe('Belongs to root. You can’t end, pause or change it from here.');
  });
});
