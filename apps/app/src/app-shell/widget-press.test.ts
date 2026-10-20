import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { href } from './hrefs';

const appRoot = join(import.meta.dirname, '..', '..');

function filesUnder(from: string): readonly string[] {
  return readdirSync(from, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(from, entry.name)) : [join(from, entry.name)],
  );
}

const sources = filesUnder(join(appRoot, 'src'))
  .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
  .map((file) => ({ path: relative(appRoot, file), text: readFileSync(file, 'utf8') }));

const declaredRoutes = new Set(
  filesUnder(join(appRoot, 'app'))
    .map((file) => relative(join(appRoot, 'app'), file).replace(/\\/g, '/'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) =>
      file
        .replace(/\.tsx$/u, '')
        .split('/')
        .filter((segment) => !segment.startsWith('('))
        .join('/')
        .replace(/(^|\/)index$/u, ''),
    )
    .map((route) => `/${route}`),
);

function pathnameOf(target: ReturnType<typeof href.device>): string {
  return typeof target === 'string' ? target : target.pathname;
}

describe('widget press targets', () => {
  it.each([
    ['a plain device', { id: 'd', kind: 'light', model: 'm' }],
    ['a camera', { id: 'c', kind: 'camera', model: 'm' }],
  ] as const)('opens a declared route for %s', (_name, device) => {
    expect(declaredRoutes.has(pathnameOf(href.device(device)))).toBe(true);
  });

  it('never wraps a wide card in a view that swallows the press meant for the card link', () => {
    const swallowing = sources.flatMap((source) => {
      const lines = source.text.split('\n');
      return lines.flatMap((line, index) => {
        const previous = lines[index - 1] ?? '';
        const wrapped = /<WideCard\b/u.test(line) && /^\s*<View\b/u.test(previous);
        return wrapped && !/pointerEvents="(box-none|none)"/u.test(previous) ? [source.path] : [];
      });
    });
    expect(swallowing).toEqual([]);
  });
});
