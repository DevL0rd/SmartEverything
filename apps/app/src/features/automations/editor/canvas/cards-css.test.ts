import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SMALLEST_OPENING_ZOOM } from './viewport';

const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;

const SHEETS = ['cards.css', 'graph-canvas.css'] as const;

function read(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
}

describe('card stylesheets', () => {
  it.each(SHEETS)('%s uses no literal colour', (name) => {
    expect(LITERAL_COLOUR.exec(read(name))).toBeNull();
  });

  it.each(SHEETS)('%s never sets text below the 11 px floor at the opening zoom', (name) => {
    const sizes = [...read(name).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) =>
      Number(match[1]),
    );
    for (const size of sizes) expect(size * SMALLEST_OPENING_ZOOM).toBeGreaterThanOrEqual(11);
  });

  it('defines the exec and taken wire tokens that the pin sheet reads', () => {
    const canvas = read('graph-canvas.css');
    expect(canvas).toMatch(/--se-wire-exec:\s*var\(--se-[a-z-]+\)/);
    expect(canvas).toMatch(/--se-wire-taken:\s*var\(--se-[a-z-]+\)/);
    expect(read('pins/pins.css')).toContain('var(--se-wire-exec');
  });

  it('turns the running glow and the taken wire glow off under reduced motion', () => {
    const canvas = read('graph-canvas.css');
    const reduced = canvas.slice(canvas.indexOf('prefers-reduced-motion: reduce'));
    expect(reduced).toContain("[data-state='running']");
    expect(reduced).toContain('gc-taken');
    expect(reduced.match(/animation:\s*none/g)?.length).toBe(2);
    expect(reduced).toContain('box-shadow');
  });

  it('never dashes a taken wire', () => {
    expect(read('graph-canvas.css')).not.toContain('dasharray');
  });

  it('gives value cards a title row over their pin rows and pills their own radius', () => {
    const css = read('cards.css');
    expect(css).toContain("[data-family='value']");
    expect(css).toMatch(/\.gc-vbody\s*\{[^}]*height:\s*52px/);
    expect(css).toMatch(/\.gc-vpin\s*\{[^}]*height:\s*32px/);
    expect(css).toContain('border-radius: 28px');
  });

  it('keeps the end cap outside the card edge and flat with a dashed End', () => {
    const css = read('cards.css');
    expect(css).toMatch(/\.gc-head-cap\s*\{[^}]*left:\s*100%/);
    expect(css).toMatch(/\.gc-end-cap\[data-kind='end'\]\s*\{[^}]*dashed/);
  });
});
