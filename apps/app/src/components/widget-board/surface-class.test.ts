import { describe, expect, it } from 'vitest';
import { surfaceClassName, WIDGET_SURFACE } from './surface-class';

const FILLS = /(^|\s)(h-full|min-h-full|flex-1|grow)(\s|$)/u;

describe('surfaceClassName', () => {
  it('fills the fixed frame a board gives a widget', () => {
    expect(surfaceClassName(true)).toMatch(/(^|\s)h-full(\s|$)/u);
    expect(surfaceClassName(true)).toContain(WIDGET_SURFACE);
  });

  it('sizes to its content in a list cell, so native layout cannot stretch it to the whole list', () => {
    expect(surfaceClassName(false)).not.toMatch(FILLS);
    expect(surfaceClassName(false)).toBe(WIDGET_SURFACE);
  });
});
