import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url).pathname;
const CANVAS = join(ROOT, 'apps/app/src/features/automations/editor/canvas');

const LITERAL_COLOUR =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?:color|fill|stroke|background(?:-color)?)\s*[:=]\s*['"]?\s*(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|pink)\b/i;

const SOURCE = /\.(?:css|tsx?)$/;

function filesOf(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesOf(path);
    const isTest = /\.test\.tsx?$/.test(entry.name);
    return SOURCE.test(entry.name) && !isTest ? [path] : [];
  });
}

describe('canvas colours', () => {
  const files = filesOf(CANVAS);

  it('finds the canvas folder', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((file) => relative(ROOT, file)))('%s has no literal colour', (file) => {
    const text = readFileSync(join(ROOT, file), 'utf8');
    expect(LITERAL_COLOUR.exec(text)?.[0]).toBeUndefined();
  });

  it('recognises literal colours', () => {
    for (const sample of ['color: #fff', 'fill="#12345678"', 'x: rgba(0,0,0,.5)', 'stroke: red']) {
      expect(LITERAL_COLOUR.test(sample)).toBe(true);
    }
    for (const sample of ['color: var(--se-ink)', 'stroke: currentColor', 'fill: none']) {
      expect(LITERAL_COLOUR.test(sample)).toBe(false);
    }
  });
});
