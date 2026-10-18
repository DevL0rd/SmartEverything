import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isEventName, isScope } from '@smarteverything/logging';

const ROOTS = [
  'assistant',
  'computers',
  'talk',
  'automations',
  'fitness',
  'nutrition',
  'settings',
  'plugins',
  'connections',
  'pairing',
].map((name) => join(__dirname, name));
ROOTS.push(join(__dirname, '..', 'plugins'));

function sources(directory: string): string[] {
  try {
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

const CALL =
  /\b(?:log|talkLog|settingsLog|connectionsLog)\.(?:trace|debug|info|warn|error|exception|operation)\(\s*'([^']+)'/g;
const TRACKED = /\btrack(?:Talk|Setting|Connection)\(\s*'([^']+)'/g;
const SCOPE = /new Logger\(\s*'([^']+)'/g;

describe('logging in the area features', () => {
  const files = ROOTS.flatMap(sources).map((path) => readFileSync(path, 'utf8'));

  it('names every event noun.verb', () => {
    const names = files.flatMap((text) => [
      ...[...text.matchAll(CALL)].map((match) => match[1] ?? ''),
      ...[...text.matchAll(TRACKED)].map((match) => match[1] ?? ''),
    ]);
    expect(names.length).toBeGreaterThan(100);
    expect(names.filter((name) => !isEventName(name) || !isEventName(`${name}.succeeded`))).toEqual(
      [],
    );
  });

  it('uses valid scopes', () => {
    const scopes = files.flatMap((text) =>
      [...text.matchAll(SCOPE)].map((match) => match[1] ?? ''),
    );
    expect(scopes.filter((scope) => !isScope(scope))).toEqual([]);
  });
});
