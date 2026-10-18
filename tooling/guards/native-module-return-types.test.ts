import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filesUnder, repositoryRoot } from './repository-files';
import { join } from 'node:path';

const kotlinRoot = join(
  repositoryRoot,
  'apps',
  'app',
  'modules',
  'health-connect',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'healthconnect',
);

const CONVERTIBLE =
  /^(Unit|String|Boolean|Int|Long|Double|Float|Any|Map<.*>|List<.*>|Array<.*>)\??$/;

function kotlinFiles(): readonly string[] {
  return filesUnder(kotlinRoot).filter((path) => path.endsWith('.kt'));
}

function returnTypes(): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, string[]>();
  for (const file of kotlinFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const owner of text.matchAll(/^object (\w+)/gm)) {
      const name = owner[1] ?? '';
      for (const member of text.matchAll(
        /^ {2}fun (\w+)\([^)]*\)(?:: ([^={\n]+?))?\s*(?:[={]|$)/gm,
      )) {
        const key = `${name}.${member[1] ?? ''}`;
        const known = found.get(key) ?? [];
        known.push((member[2] ?? 'Unit').trim());
        found.set(key, known);
      }
    }
  }
  return found;
}

function lambdaCalls(text: string): readonly string[] {
  return [...text.matchAll(/(?:Async)?Function\("\w+"\)[^\n]*\{[^\n]*\n\s+(\w+\.\w+)\(/g)].map(
    (match) => match[1] ?? '',
  );
}

describe('native module function results', () => {
  const types = returnTypes();
  const modules = kotlinFiles().filter((path) => path.endsWith('Module.kt'));

  it('finds the modules and the objects they call', () => {
    expect(modules.length).toBeGreaterThan(0);
    expect(types.get('AssistantCalls.openForApp')).toEqual(['Unit']);
  });

  it.each(modules.map((path) => [path.slice(kotlinRoot.length + 1), path] as const))(
    '%s returns only types Expo can convert to JavaScript',
    (_name, path) => {
      const unconvertible = lambdaCalls(readFileSync(path, 'utf8')).flatMap((call) =>
        (types.get(call) ?? [])
          .filter((type) => !CONVERTIBLE.test(type))
          .map((type) => `${call}: ${type}`),
      );
      expect(unconvertible).toEqual([]);
    },
  );
});
