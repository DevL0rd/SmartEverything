import { describe, expect, it } from 'vitest';
import { deviceGlyphPathOf, glyphPathOf } from './glyphs';
import { objectCategory } from './symbols';

describe('plan symbols', () => {
  it('reads the category from catalogue ids and has a glyph for each one', () => {
    expect(objectCategory({ modelId: 'cat.bedroom.queen-bed', kind: 'x' })).toBe('bedroom');
    expect(objectCategory({ modelId: 'plugin.thing', kind: 'lamp' })).toBe('lamp');
    expect(glyphPathOf('bedroom')).not.toBe(glyphPathOf('unknown'));
    expect(glyphPathOf('unknown')).toMatch(/^M/u);
  });

  it('has a device glyph for known kinds and a fallback', () => {
    expect(deviceGlyphPathOf('camera')).not.toBe(deviceGlyphPathOf(null));
  });
});
