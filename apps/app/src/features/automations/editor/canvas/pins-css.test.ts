import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SMALLEST_OPENING_ZOOM } from './viewport';

const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;

const css = readFileSync(new URL('./pins/pins.css', import.meta.url), 'utf8');

describe('pins stylesheet', () => {
  it('uses no literal colour', () => {
    expect(LITERAL_COLOUR.exec(css)).toBeNull();
  });

  it('never sets text below the 11 px floor at the opening zoom', () => {
    const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) =>
      Number(match[1]),
    );
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size * SMALLEST_OPENING_ZOOM).toBeGreaterThanOrEqual(11);
  });

  it('keeps rows 40 px for a pointer and 48 px for touch and makes the whole row the output target', () => {
    expect(css).toContain('--gc-row-h: 40px');
    expect(css).toContain("[data-idiom='touch']");
    expect(css).toContain('--gc-row-h: 48px');
    expect(css).toMatch(/\.gc-exec-out\s*\{[^}]*height:\s*100%/);
  });

  it('draws exec wires at 2.5 px in the exec token and value wires at 1.5 px', () => {
    expect(css).toMatch(
      /gc-edge-exec[^{]*\{[^}]*stroke:\s*var\(--gc-exec\)[^}]*stroke-width:\s*2\.5/,
    );
    expect(css).toMatch(/gc-edge-value[^{]*\{[^}]*stroke-width:\s*1\.5/);
    expect(css).toContain('--se-wire-exec');
  });

  it('never dashes a taken wire and animates only while the run is live', () => {
    const taken = /gc-taken[^{]*\{[^}]*\}/g;
    for (const rule of css.match(taken) ?? []) expect(rule).not.toContain('dasharray');
    expect(css).toContain("[data-live='true']");
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
});
