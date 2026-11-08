import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PARTS = [
  'canvas',
  'drafts',
  'header',
  'host',
  'inspector',
  'palette',
  'problems',
  'screen',
] as const;

const ROOT = fileURLToPath(new URL('.', import.meta.url));

function modulesOf(part: string): readonly string[] {
  return readdirSync(`${ROOT}${part}`, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => `${ROOT}${part}/${path}`);
}

describe.each(PARTS)('the %s part of the editor', (part) => {
  const modules = modulesOf(part);

  it('has modules', () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  it.each(modules)('loads %s', async (path) => {
    expect(await import(path)).toBeTypeOf('object');
  });
});
