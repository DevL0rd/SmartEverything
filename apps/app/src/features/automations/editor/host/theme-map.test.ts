import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NODE_CATEGORIES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { COLOUR_ROLES } from '../../../../design/colour-roles';
import { TYPE_COLOUR } from '../../../../design/node-colours';
import type { ColourRole } from '../../../../design/tokens';
import { PORT_TYPE_TOKENS, buildCanvasTheme } from './theme-map';

const resolve = (role: ColourRole): string => `resolved:${role}`;

const CANVAS_DIRECTORY = fileURLToPath(new URL('../canvas', import.meta.url));

const SET_AT_RUNTIME = new Set(['--se-zoom']);

function cssSources(): readonly string[] {
  return readdirSync(CANVAS_DIRECTORY, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.css'))
    .map((path) => readFileSync(`${CANVAS_DIRECTORY}/${path}`, 'utf8'));
}

function variablesWithoutFallback(css: string): readonly string[] {
  return [...css.matchAll(/var\((--se-[a-z0-9-]+)\s*\)/g)].flatMap((match) => match[1] ?? []);
}

function variablesDeclared(css: string): ReadonlySet<string> {
  return new Set([...css.matchAll(/(--se-[a-z0-9-]+)\s*:/g)].flatMap((match) => match[1] ?? []));
}

describe('canvas theme map', () => {
  it('writes one --se variable for every colour role', () => {
    const theme = buildCanvasTheme(resolve);
    for (const role of COLOUR_ROLES) expect(theme[`--se-${role}`]).toBe(`resolved:${role}`);
  });

  it('colours every port type token from the data colours', () => {
    const theme = buildCanvasTheme(resolve);
    for (const [token, type] of Object.entries(PORT_TYPE_TOKENS)) {
      expect(theme[`--se-type-${token}`]).toBe(`resolved:${TYPE_COLOUR[type]}`);
    }
    expect(theme['--se-type-error']).toBe('resolved:critical');
    expect(theme['--se-type-boolean']).toBe('resolved:viz-violet');
  });

  it('colours every node category by its id', () => {
    const theme = buildCanvasTheme(resolve);
    for (const { id } of NODE_CATEGORIES) expect(theme[`--se-cat-${id}`]).toMatch(/^resolved:/);
    expect(theme['--se-cat-triggers']).toBe('resolved:primary');
    expect(theme['--se-cat-state']).toBe('resolved:caution');
  });

  it('follows the resolver, so a palette change reaches every variable', () => {
    const light = buildCanvasTheme((role) => `light:${role}`);
    const dark = buildCanvasTheme((role) => `dark:${role}`);
    expect(Object.keys(light)).toEqual(Object.keys(dark));
    for (const name of Object.keys(light)) expect(light[name]).not.toBe(dark[name]);
  });

  it('supplies every variable the canvas stylesheets read without a fallback', () => {
    const theme = buildCanvasTheme(resolve);
    const sources = cssSources();
    expect(sources.length).toBeGreaterThan(0);
    const declared = new Set(sources.flatMap((css) => [...variablesDeclared(css)]));
    const missing = sources
      .flatMap(variablesWithoutFallback)
      .filter((name) => !(name in theme) && !declared.has(name) && !SET_AT_RUNTIME.has(name));
    expect(missing).toEqual([]);
  });
});
