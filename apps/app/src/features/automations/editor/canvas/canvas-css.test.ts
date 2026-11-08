import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;

const SHEETS = [
  'canvas-frame.css',
  'graph-canvas.css',
  'cards.css',
  'pins/pins.css',
  'edges/edges.css',
  'connect/connect.css',
] as const;

describe('canvas stylesheets', () => {
  it.each(SHEETS)('%s uses no literal colour', (name) => {
    const css = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    expect(LITERAL_COLOUR.exec(css)).toBeNull();
  });

  it('pauses animations', () => {
    const css = readFileSync(new URL('./canvas-frame.css', import.meta.url), 'utf8');
    expect(css).toContain('animation-play-state: paused');
  });

  it('keeps exec pins tappable at any zoom and turns only value pins off below the port zoom', () => {
    const css = readFileSync(new URL('./canvas-frame.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /\[data-ports='off'\] \.react-flow__handle\.gc-value\s*\{\s*pointer-events: none/,
    );
    expect(css).not.toMatch(/\[data-ports='off'\] \.react-flow__handle\s*\{/);
  });

  it('gives the wire plus button, the more outputs row and touch pins a 44 px hit area', () => {
    const edges = readFileSync(new URL('./edges/edges.css', import.meta.url), 'utf8');
    expect(edges).toMatch(/\.gc-insert::before\s*\{[^}]*width: 44px;[^}]*height: 44px;/);
    const pins = readFileSync(new URL('./pins/pins.css', import.meta.url), 'utf8');
    expect(pins).toMatch(/\[data-idiom='touch'\]\s*\{[^}]*--se-handle-pad: 44px;/);
    expect(pins).toMatch(
      /\[data-idiom='touch'\] \.gc-more::before\s*\{[^}]*position: absolute;[^}]*height: 44px;/,
    );
    const frame = readFileSync(new URL('./canvas-frame.css', import.meta.url), 'utf8');
    expect(frame).toMatch(
      /\.react-flow__handle::after\s*\{[^}]*width: var\(--se-handle-pad\);[^}]*height: var\(--se-handle-pad\);/,
    );
  });

  it('flags the guard pattern', () => {
    expect(LITERAL_COLOUR.test('color: #fff')).toBe(true);
    expect(LITERAL_COLOUR.test('color: var(--se-bg)')).toBe(false);
  });
});
