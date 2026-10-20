import { describe, expect, it } from 'vitest';
import { loopReturnPath } from './loop-return';

describe('loopReturnPath', () => {
  it('starts at the body end and finishes near the loop head', () => {
    const path = loopReturnPath({ width: 300, height: 200, inset: 12 });
    expect(path.startsWith('M 150 188')).toBe(true);
    expect(path.endsWith('174 24')).toBe(true);
  });

  it('keeps the bend between 16 and 48 px', () => {
    expect(loopReturnPath({ width: 300, height: 40, inset: 12 })).toContain('C 304');
    expect(loopReturnPath({ width: 300, height: 900, inset: 12 })).toContain('C 336');
  });
});
