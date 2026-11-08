import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Theme = 'dark' | 'light';

const THEMES: readonly Theme[] = ['dark', 'light'];
const SURFACES = ['surface-1', 'surface-2', 'surface-3'] as const;
const FILLED_TEXT = new Set(['on-primary']);

const globals = readFileSync(new URL('../../../../../global.css', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('./graph-canvas.css', import.meta.url), 'utf8');
const cards = readFileSync(new URL('./cards.css', import.meta.url), 'utf8');

function blockOf(theme: Theme): string {
  const start = globals.indexOf(`@variant ${theme} {`);
  const next = globals.indexOf('@variant', start + 1);
  return globals.slice(start, next === -1 ? undefined : next);
}

function tokenOf(theme: Theme, name: string): string {
  const match = new RegExp(`--color-${name}: (#[0-9a-f]{6});`, 'i').exec(blockOf(theme));
  if (match?.[1] === undefined) throw new Error(`--color-${name} is not a hex colour in ${theme}`);
  return match[1];
}

function roleOf(variable: string): string {
  const match = new RegExp(`${variable}:\\s*var\\(--se-([a-z0-9-]+)\\)`).exec(canvas);
  if (match?.[1] === undefined) throw new Error(`${variable} is not defined in graph-canvas.css`);
  return match[1];
}

function channel(hex: string, from: number): number {
  const value = parseInt(hex.slice(from, from + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

function textRoles(css: string): readonly string[] {
  const roles = [...css.matchAll(/(?<![-\w])color:\s*var\(--se-([a-z0-9-]+)\)/g)].map(
    (match) => match[1] ?? '',
  );
  return [...new Set(roles)].filter((role) => !FILLED_TEXT.has(role));
}

describe('wire colours', () => {
  it('defines the exec and the taken wire as two different theme roles', () => {
    expect(roleOf('--se-wire-exec')).not.toBe(roleOf('--se-wire-taken'));
  });

  it.each(THEMES)('keep exec and taken wires at 3:1 on every %s surface', (theme) => {
    for (const variable of ['--se-wire-exec', '--se-wire-taken']) {
      for (const surface of SURFACES) {
        const wire = tokenOf(theme, roleOf(variable));
        expect(contrast(wire, tokenOf(theme, surface))).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it.each(THEMES)('keep exec wires and pins visible on the canvas background in %s', (theme) => {
    const wire = tokenOf(theme, roleOf('--se-wire-exec'));
    expect(contrast(wire, tokenOf(theme, 'bg'))).toBeGreaterThanOrEqual(3);
  });

  it.each(THEMES)('keep the failure accent at 3:1 on the card surface in %s', (theme) => {
    expect(
      contrast(tokenOf(theme, 'critical'), tokenOf(theme, 'surface-2')),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('card text colours', () => {
  it('uses at least one text role', () => {
    expect(textRoles(cards).length).toBeGreaterThan(0);
  });

  it.each(THEMES)('keep every text role at 4.5:1 on the card surfaces in %s', (theme) => {
    for (const role of textRoles(cards)) {
      for (const surface of ['surface-1', 'surface-2'] as const) {
        expect(contrast(tokenOf(theme, role), tokenOf(theme, surface))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
