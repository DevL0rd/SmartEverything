import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, repositoryRoot } from './repository-files';

const moduleRoot = join(repositoryRoot, 'apps', 'app', 'modules', 'health-connect');
const kotlinRoot = join(
  moduleRoot,
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'healthconnect',
);

const KOTLIN_SCOPE: Readonly<Record<string, readonly string[]>> = {
  HubNetwork: ['network'],
  Phone: ['phone'],
  Talk: ['talk'],
  AssistantCall: ['assistant'],
  Diagnostics: ['diagnostics'],
  Listening: ['listening'],
  Treadmill: ['treadmill'],
  Larq: ['larq'],
  Sonicare: ['sonicare'],
  HealthConnect: [''],
};

function exportedBy(text: string): readonly string[] {
  const patterns = [/(?:Async)?Function\("(\w+)"\)/g, /EVENT = "(\w+)"/g];
  const plain = patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => m[1] ?? ''));
  const events = [...text.matchAll(/Events\(([^)]*)\)/g)].flatMap((list) =>
    [...(list[1] ?? '').matchAll(/"(\w+)"/g)].map((m) => m[1] ?? ''),
  );
  return [...plain, ...events];
}

function inScope(inside: string, scope: string): boolean {
  return scope === '' ? !inside.includes('/') : inside.startsWith(`${scope}/`);
}

function kotlinNames(module: string): ReadonlySet<string> {
  const scopes = KOTLIN_SCOPE[module] ?? [];
  const files = filesUnder(kotlinRoot).filter((path) => path.endsWith('.kt'));
  const wanted = files.filter((file) =>
    scopes.some((scope) => inScope(file.slice(kotlinRoot.length + 1), scope)),
  );
  return new Set(wanted.flatMap((file) => exportedBy(readFileSync(file, 'utf8'))));
}

interface Declared {
  readonly file: string;
  readonly module: string;
  readonly members: readonly string[];
}

function declarations(): readonly Declared[] {
  const found: Declared[] = [];
  const sources = filesUnder(join(repositoryRoot, 'apps', 'app')).filter(
    (path) =>
      /\.(ts|tsx)$/.test(path) &&
      !path.includes('node_modules') &&
      !path.includes('/android/') &&
      !path.endsWith('.test.ts'),
  );
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const load of text.matchAll(/requireOptionalNativeModule<(\w+)>\('(\w+)'\)/g)) {
      const type = load[1] ?? '';
      const body = new RegExp(
        `(?:declare class ${type} extends NativeModule(?:<[^>]*>)?|interface ${type})\\s*\\{([\\s\\S]*?)\\n\\}`,
      ).exec(text);
      const members = [...(body?.[1] ?? '').matchAll(/^ {2}(?:readonly )?(\w+)[(:]/gm)].map(
        (member) => member[1] ?? '',
      );
      found.push({ file, module: load[2] ?? '', members });
    }
  }
  return found;
}

describe('native module contract', () => {
  const declared = declarations();

  it('finds every native module the app loads', () => {
    expect(declared.length).toBeGreaterThan(0);
    for (const entry of declared) expect(Object.keys(KOTLIN_SCOPE)).toContain(entry.module);
  });

  it.each(declared.map((entry) => [entry.file.slice(repositoryRoot.length + 1), entry] as const))(
    '%s only calls functions the Kotlin module exports',
    (_name, entry) => {
      const exported = kotlinNames(entry.module);
      const missing = entry.members.filter((member) => !exported.has(member));
      expect(missing).toEqual([]);
    },
  );
});
