import { describe, expect, it } from 'vitest';
import { sheetFrame } from './sheet-frame';

describe('sheetFrame', () => {
  it('lets the body fill a fixed height sheet so non-scrolling panels keep their content', () => {
    expect(sheetFrame(['full'], 800)).toEqual({ sized: { height: 800 }, body: 'min-h-0 flex-1' });
    expect(sheetFrame(['half', 'full'], 800)).toEqual({
      sized: { height: 800 },
      body: 'min-h-0 flex-1',
    });
  });

  it('sizes a fitting sheet to its content and lets the body shrink to the cap', () => {
    expect(sheetFrame(['fit'], 800)).toEqual({ sized: { maxHeight: 800 }, body: 'min-h-0 shrink' });
    expect(sheetFrame(['fit', 'full'], 800)).toEqual({
      sized: { maxHeight: 800 },
      body: 'min-h-0 shrink',
    });
  });
});
