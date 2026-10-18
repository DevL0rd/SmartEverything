import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isEventName, isScope } from '@smarteverything/logging';

const ROOTS = [
  'devices',
  'device-list',
  'device-visuals',
  'home',
  'cameras',
  'climate',
  'rooms',
  'scenes',
  'weather',
  'watches',
  'body',
  'presence',
  '../components/widget-board',
  '../store/command-ledger.ts',
  '../store/prefs.ts',
].map((name) => join(__dirname, '..', '..', name));

function sources(directory: string): string[] {
  try {
    if (statSync(directory).isFile()) {
      return [directory];
    }
    return readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        return sources(path);
      }
      return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
    });
  } catch {
    return [];
  }
}

const CALL = /\blog\.(?:trace|debug|info|warn|error|exception)\(\s*'([^']+)'/g;
const SCOPE = /new Logger\(\s*'([^']+)'/g;

describe('logging in the feature areas', () => {
  const files = ROOTS.flatMap(sources).map((path) => readFileSync(path, 'utf8'));

  it('names every event noun.verb', () => {
    const names = files.flatMap((text) => [...text.matchAll(CALL)].map((match) => match[1] ?? ''));
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !isEventName(name))).toEqual([]);
  });

  it('uses valid scopes', () => {
    const scopes = files.flatMap((text) =>
      [...text.matchAll(SCOPE)].map((match) => match[1] ?? ''),
    );
    expect(scopes.filter((scope) => !isScope(scope))).toEqual([]);
  });
});
