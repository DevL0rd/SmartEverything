import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const PARTS = ['hosts', 'runs/run-view', 'detail', 'functions/make-reusable'] as const;

function modulesOf(part: string): readonly string[] {
  return readdirSync(`${ROOT}${part}`, { encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => `${ROOT}${part}/${path}`);
}

describe.each(PARTS)('the %s modules', (part) => {
  const modules = modulesOf(part);

  it('has modules', () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  it.each(modules)('loads %s', async (path) => {
    expect(await import(path)).toBeTypeOf('object');
  });
});
