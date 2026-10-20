import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;

const SHEETS = ['canvas-frame.css', 'canvas.css', 'nodes/nodes.css'] as const;

describe('canvas stylesheets', () => {
  it.each(SHEETS)('%s uses no literal colour', (name) => {
    const css = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    expect(LITERAL_COLOUR.exec(css)).toBeNull();
  });

  it('pauses animations and shrinks the attribution', () => {
    const css = readFileSync(new URL('./canvas-frame.css', import.meta.url), 'utf8');
    expect(css).toContain('animation-play-state: paused');
    expect(css).toContain('.react-flow__attribution');
  });

  it('flags the guard pattern', () => {
    expect(LITERAL_COLOUR.test('color: #fff')).toBe(true);
    expect(LITERAL_COLOUR.test('color: var(--se-bg)')).toBe(false);
  });
});
