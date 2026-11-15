import { describe, expect, it } from 'vitest';
import { sheetDrop, sheetFrame } from './sheet-frame';

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

describe('sheetDrop', () => {
  it('moves a sheet with a layout offset so touch handling measures where the sheet really is', () => {
    expect(sheetDrop(0)).toEqual({ bottom: -0 });
    expect(sheetDrop(320)).toEqual({ bottom: -320 });
    expect(sheetDrop(-24)).toEqual({ bottom: 24 });
    expect(Object.keys(sheetDrop(320))).not.toContain('transform');
  });
});
