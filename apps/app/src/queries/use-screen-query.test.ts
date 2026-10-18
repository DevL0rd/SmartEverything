import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = join(__dirname, '..');

const WRAPPER = 'queries/use-screen-query.ts';

const DIRECT_QUERY =
  /import\s*\{[^}]*\buse(?:Infinite)?Query\b[^}]*\}\s*from\s*'@tanstack\/react-query'/;

const RAW_STORE_HOOK = /\buseSyncExternalStore\(/;

const SCREEN_DATA_ROOTS = ['features', 'components', 'plugins'];

const GLOBAL_STORE_HOOKS = ['features/assistant/data/area-status.ts'];

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

const files = sources(SOURCE).map((path) => ({
  name: relative(SOURCE, path),
  text: readFileSync(path, 'utf8'),
}));

describe('data hooks inside screens', () => {
  it('read queries only through the pausable screen query hooks', () => {
    const direct = files
      .filter((file) => file.name !== WRAPPER && DIRECT_QUERY.test(file.text))
      .map((file) => file.name);
    expect(direct).toEqual([]);
  });

  it('read external stores through usePausable or the store selectors', () => {
    const raw = files
      .filter(
        (file) =>
          SCREEN_DATA_ROOTS.some((root) => file.name.startsWith(`${root}/`)) &&
          !GLOBAL_STORE_HOOKS.includes(file.name) &&
          RAW_STORE_HOOK.test(file.text),
      )
      .map((file) => file.name);
    expect(raw).toEqual([]);
  });
});
